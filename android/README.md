# Android — Kotlin / Jetpack Compose

Donor-facing Android app (Kotlin, Jetpack Compose, Firebase). Users select an association, set a donation amount by tapping coins/bills, and pay via Stripe.

## Architecture: MVVM + Protocol-based Data Sources + Compose UI

```
┌──────────────────────────────────────────────────────────┐
│  Fragment / ComposeView (UI)                             │  ← Views, no logic
├──────────────────────────────────────────────────────────┤
│  ViewModel (LiveData / StateFlow)                        │  ← UI state
├──────────────────────────────────────────────────────────┤
│  Model / CurrentUser (object singleton)                  │  ← domain state
├──────────────────────────────────────────────────────────┤
│  Data Source Interfaces (suspend fun)                    │  ← RemoteDataRetriever / Setter
├──────────────────────────────────────────────────────────┤
│  Firestore / SharedPreferences                           │  ← concrete implementations
└──────────────────────────────────────────────────────────┘
```

The app uses a **hybrid UI strategy**: traditional Fragment + ViewBinding for the main screen layout, Jetpack Compose for all overlays (dialogs, modals, list screens). The two worlds meet at `ComposeView.setContent { }` inside Fragment's `onCreateView`.

---

## Files in this showcase

### `domain/`

| File | What it shows |
|---|---|
| [`Asso.kt`](domain/Asso.kt) | Main aggregate — class with id-only equality, Firestore key constants, multilingual name resolution (preferred language → default → legacy scalar), extension functions for tax receipt presentation and local persistence serialization. |
| [`DonationEligibility.kt`](domain/DonationEligibility.kt) | Sealed class result type + pure `object` service. No Android dependencies — fully unit-testable. Private extension functions keep the service readable. |

### `data/`

| File | What it shows |
|---|---|
| [`RemoteInterfaces.kt`](data/RemoteInterfaces.kt) | Two `suspend fun` interfaces over Firestore. The concrete implementation converts Firebase Tasks to coroutines with `.await()`. Injected via top-level `lateinit var` — swappable for mocks in tests. |

### `model/`

| File | What it shows |
|---|---|
| [`CurrentUser.kt`](model/CurrentUser.kt) | Kotlin `object` singleton — no boilerplate, just `CurrentUser.email`. Every property override routes reads to SharedPreferences and writes to SharedPreferences + Firestore (fire-and-forget coroutine). |

### `viewmodel/`

| File | What it shows |
|---|---|
| [`TsedakaSessionVM.kt`](viewmodel/TsedakaSessionVM.kt) | AndroidX ViewModel with LiveData. Shared across Fragments via `activityViewModels()`. Donation amount cap logic lives here, not in the Fragment. |
| [`PaymentDialogsVM.kt`](viewmodel/PaymentDialogsVM.kt) | Activity-scoped ViewModel with four `StateFlow<Boolean>` — one per payment dialog. `usePaymentDialogsState()` is a `@Composable` extension on the VM that snapshots all four flows at once. `PaymentDialogsUI` is a `@Composable` extension on a Fragment — the interop point where Compose accesses `findNavController()`. |

### `ui/`

| File | What it shows |
|---|---|
| [`CustomDialog.kt`](ui/CustomDialog.kt) | Reusable `@Composable` dialog driven by `MutableStateFlow<Boolean>`. Optional title/message/left button produce null slots. |
| [`HistoryScreen.kt`](ui/HistoryScreen.kt) | `@Composable` extension functions on domain objects (`History.ListView()`, `List<Promise>.ListView()`). Sealed class dispatch (`when (parentFrag)`). LazyColumn with `itemsIndexed`. RTL-aware back arrow. |
| [`HistoryViewListItem.kt`](ui/HistoryViewListItem.kt) | Sealed class with **abstract `@Composable` methods** — each subclass owns its rendering. Shared `CardViewItem` calls `LeftBottomComposable`/`RightBottomComposable` as polymorphic slots. `remember { mutableStateOf }` for ephemeral local UI state. |

---

## Key patterns

**Kotlin `object` singleton**
```kotlin
object CurrentUser : User() {
    override var email: String
        get() = systemDataRetriever.email()
        set(value) {
            systemDataSetter.setEmail(value)
            MainScope().launch { remoteDataSetter.setEmail(value) } // fire-and-forget
        }
}
// Caller: CurrentUser.email = "..." — no getInstance(), no factory.
```

**StateFlow + collectAsState() — Compose-reactive ViewModel**
```kotlin
// ViewModel:
private val _showLowAmountDialog = MutableStateFlow(false)
val showLowAmountDialog: StateFlow<Boolean> = _showLowAmountDialog.asStateFlow()

// Composable:
@Composable
fun PaymentDialogsVM.usePaymentDialogsState() = PaymentDialogsState(
    showLowAmountDialog = showLowAmountDialog.collectAsState().value,
    // … three other flows
)
// One snapshot object → one recomposition trigger.
```

**Sealed class with abstract @Composable methods**
```kotlin
sealed class HistoryViewListItem {
    @Composable abstract fun LeftBottomComposable(modifier: Modifier)
    @Composable abstract fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier)

    @Composable
    open fun CardViewItem(parentFrag: Fragment) {
        Card { Column {
            // … shared layout …
            LeftBottomComposable(Modifier)   // ← polymorphic slot
            RightBottomComposable(parentFrag, Modifier)
        } }
    }
}
// Each subclass fills its slots differently — no `when` inside the shared layout.
```

**Coroutine-first data layer**
```kotlin
// Interface (no callbacks, no RxJava):
suspend fun assoWithStripeAccounts(assoId: String): Asso

// ViewModel caller:
suspend fun pushAsFirstAssoFavo(assoId: String) {
    pushAsFirstAssoFavo(remoteDataRetriever.assoWithStripeAccounts(assoId))
}
```

**Sealed class domain result**
```kotlin
sealed class DonationEligibilityResult {
    object Ready : DonationEligibilityResult()
    data class RequireCard(val message: Message) : DonationEligibilityResult()
}

// Caller (exhaustive when, compiler-verified):
when (val result = DonationEligibilityService.evaluateEligibility(asso, amount)) {
    is DonationEligibilityResult.Ready        -> saveSessionAndCallPayPromises()
    is DonationEligibilityResult.RequireCard  -> when (result.message) {
        Message.NONE     -> vm.openPaymentDialog()
        Message.REASSURE -> vm.openNewCbSaveRequiredDialog()
    }
}
```

**@Composable extension functions on domain objects**
```kotlin
@Composable
fun History.ListView(parentFrag: Fragment) {
    LazyColumn { itemsIndexed(buildHistoryItems(parentFrag)) { _, item ->
        item.CardViewItem(parentFrag)
    } }
}
// Call site reads: history?.ListView(parentFrag) — no wrapping composable needed.
```

---

## Compose / Fragment interop

The main donation screen is a `Fragment` with ViewBinding for the primary layout (coins, bills, amount field, buttons). Payment overlays (dialogs, card registration) run in a `ComposeView` embedded in the same Fragment:

```kotlin
// Inside Fragment.onCreateView:
binding.cbPop.setContent {          // cbPop is a ComposeView in the XML layout
    AppTheme {
        PaymentDialogsUI(
            state   = vm.usePaymentDialogsState(),
            payload = SetupIntentPayload.forDonateButton(…)
        )
        if (showResetDialog.collectAsState().value) { ResetDialog() }
    }
}
```

This hybrid approach lets Compose handle the complex, stateful overlay layer while ViewBinding handles the stable, animation-heavy primary layout (coin tap animations, scroll position persistence).
