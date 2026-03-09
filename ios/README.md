# iOS — Swift / UIKit

Donor-facing iOS app (Swift 5, UIKit, Firebase). Users select an association, set a donation amount by tapping coins/bills, and pay via Stripe.

## Architecture: MVVM + Protocol-based Data Sources

```
┌────────────────────────────────────────┐
│  ViewControllers + ViewModels (MVVM)   │  ← UIKit, no business logic
├────────────────────────────────────────┤
│  Model (CurrentUser, domain objects)   │  ← state, domain rules
├────────────────────────────────────────┤
│  Data Sources (protocol façades)       │  ← RemoteDataSource / SystemDataSource
├────────────────────────────────────────┤
│  Firestore / UserDefaults / Functions  │  ← concrete implementations
└────────────────────────────────────────┘
```

Communication between layers is via **NSNotification** (InAppNotif), not delegation or closures, which keeps ViewControllers decoupled from each other and from ViewModels.

---

## Files in this showcase

### `domain/`

| File | What it shows |
|---|---|
| [`Asso.swift`](domain/Asso.swift) | Main domain struct — value type, Equatable by id, extensions split by concern (tax receipt presentation, serialization, array helpers). System JSON keys are constants on the struct itself. |
| [`Recurring.swift`](domain/Recurring.swift) | Recurring donation — two `Equatable` semantics (`==` for identity, `isDisplayedTheSameInEditFormVc` for UI change detection). Anchor encoding: time-of-day as quarter-hour index (0–95) for trivial arithmetic and sorting. |

### `data/`

| File | What it shows |
|---|---|
| [`RemoteProtocols.swift`](data/RemoteProtocols.swift) | Four protocols split by responsibility: `RemoteDataSetter` (writes), `RemoteDataRetriever` (one-shot fetches), `RemoteDataReader` (real-time listeners), `RemoteDataRef` (document references). ViewControllers and ViewModels depend on these protocols only — never on `FirestoreDataSource` directly. |

### `model/`

| File | What it shows |
|---|---|
| [`CurrentUser.swift`](model/CurrentUser.swift) | Singleton with smart property forwarding: every property override routes reads/writes to the correct store (UserDefaults for speed, Firestore for persistence). Properties that need remote sync trigger the write inside their `set`. NSNotification broadcast on relevant changes. Includes the debit eligibility rule (amount × time thresholds). |

### `viewmodels/`

| File | What it shows |
|---|---|
| [`MainVM.swift`](viewmodels/MainVM.swift) | MVVM ViewModel for the main donation screen. Static `didSet` observers trigger NSNotifications. `tsedaViewToDisplay()` maps amount to a coin/bill image using currency-specific thresholds. `currentSessionToPromise()` converts UI state into a domain object. |

---

## Key patterns

**Prod / demo toggle**
Same as the backend: `Params.isProd` is a single boolean that selects the Firestore collection (`Users` vs `UsersDemo`, etc.) and the Cloud Function variant (`payPromises` vs `payPromisesDemo`). No environment config files — just one boolean threaded through the stack.

**Value types for domain objects**
`Asso` and `Recurring` are structs. Passing them between layers creates copies, making state mutations explicit and preventing aliasing bugs that are common with class-based models.

**Named Equatable semantics**
`Recurring` provides both `==` (id-based, for collection operations) and `isDisplayedTheSameInEditFormVc` (field-by-field, for the Save button). Two methods with different semantics rather than overloading one operator.

**Anchor encoding**
`Recurring.anchor` for DAILY recurrings encodes time-of-day as `hour * 4 + (minute / 15)`. Range 0–95. This makes sorting (`sortByDate()` is just `sort { $0.anchor < $1.anchor }`), arithmetic, and display all trivial.
