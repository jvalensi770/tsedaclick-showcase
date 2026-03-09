// MARK: - ViewModel — PaymentDialogsVM + Composable UI
//
// Centralises all payment-flow dialog state in one Activity-scoped ViewModel.
// The Fragment base class (FragmentWithPaymentDialogs) and the @Composable UI
// function (PaymentDialogsUI) live in the same file to show how Compose and
// the classic Fragment/ViewModel stack integrate.
//
// Architecture:
//  - PaymentDialogsVM holds four StateFlow<Boolean> — one per dialog.
//    StateFlow (not LiveData) because the Compose layer reads it via `collectAsState()`.
//  - The ViewModel is scoped to the Activity, so a dialog opened in Frag1
//    stays open if the user switches tabs (Frag2, Frag3) and comes back.
//  - `usePaymentDialogsState()` is a @Composable extension on the VM that
//    collects all four flows into a single `PaymentDialogsState` snapshot.
//    The Composable tree re-composes only when one of the four values changes.
//  - `PaymentDialogsUI` is a @Composable extension on FragmentWithPaymentDialogs:
//    it can access `findNavController()` (Fragment API) while also being a
//    regular composable function — the interop point between the two worlds.
//
// Key Kotlin + Compose patterns:
//  - `StateFlow` + `collectAsState()` for reactive UI state
//  - `@Composable` extension functions on non-Composable classes
//  - `when { condition -> ... }` as the top-level Compose branching primitive
//  - `data class` for immutable UI state snapshots (PaymentDialogsState)
//  - Abstract Fragment base class for shared Compose hosting (setContent on a ComposeView)

package com.kikarov.tsedaclick.activities.fragments

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.res.stringResource
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import com.kikarov.tsedaclick.R
import com.kikarov.tsedaclick.objects.Asso
import com.kikarov.tsedaclick.objects.Currency
import com.kikarov.tsedaclick.stripe.CbSaver
import com.kikarov.tsedaclick.stripe.DialogCB
import com.kikarov.tsedaclick.stripe.SetupIntentPayload
import com.kikarov.tsedaclick.views.CustomDialog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// ──────────────────────────────────────────────────────────────────────────────
// Fragment base class
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Abstract Fragment that hosts the payment dialog layer.
 * Concrete screens inherit this to get dialog management "for free".
 *
 * The ViewModel is scoped to the Activity so dialogs survive tab switches.
 */
abstract class FragmentWithPaymentDialogs : Fragment() {

    val vm: PaymentDialogsVM by activityViewModels()

    /** Optional 3DS pre-auth message. Non-null → show confirmation before charging. */
    open val threeDSDialogMessage: String? = null
    val show3dSecureDialog = MutableStateFlow(false)

    abstract fun onSuccessSetup()
    abstract fun goToLegalNoticeFrag()
}

// ──────────────────────────────────────────────────────────────────────────────
// ViewModel
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Activity-scoped ViewModel that owns the open/close state of every payment dialog.
 *
 * Each dialog has a private MutableStateFlow and a public read-only StateFlow.
 * The open/close helpers are the only write paths — Composables never touch
 * the MutableStateFlow directly (except CustomDialog, which needs it to handle
 * dismiss-by-tap-outside; see CustomDialog.kt).
 */
class PaymentDialogsVM : ViewModel() {

    // 1. Card registration dialog
    private val _showPaymentDialog = MutableStateFlow(false)
    val showPaymentDialog: StateFlow<Boolean> = _showPaymentDialog.asStateFlow()
    fun openPaymentDialog()  { _showPaymentDialog.value  = true }
    fun closePaymentDialog() { _showPaymentDialog.value  = false }

    // 2. Low-amount warning ("perouta")
    internal val _showLowAmountDialog = MutableStateFlow(false)
    val showLowAmountDialog: StateFlow<Boolean> = _showLowAmountDialog.asStateFlow()
    fun openLowAmountDialog()  { _showLowAmountDialog.value  = true }
    fun closeLowAmountDialog() { _showLowAmountDialog.value  = false }

    // 3. New card required (high-amount, asso-specific Stripe account)
    internal val _showNewCbSaveRequired = MutableStateFlow(false)
    val showNewCbSaveRequired: StateFlow<Boolean> = _showNewCbSaveRequired.asStateFlow()
    fun openNewCbSaveRequiredDialog()  { _showNewCbSaveRequired.value  = true }
    fun closeNewCbSaveRequiredDialog() { _showNewCbSaveRequired.value  = false }

    // 4. Association has no CERFA tax-receipt eligibility
    internal val _showNoTaxReceiptWarningDialog = MutableStateFlow(false)
    val showNoTaxReceiptWarningDialog: StateFlow<Boolean> = _showNoTaxReceiptWarningDialog.asStateFlow()
    fun openNoTaxReceiptWarningDialog()  { _showNoTaxReceiptWarningDialog.value  = true }
    fun closeNoTaxReceiptWarningDialog() { _showNoTaxReceiptWarningDialog.value  = false }

    /** Closes all dialogs at once (e.g. on navigation reset). */
    fun resetDialogs() {
        _showPaymentDialog.value           = false
        _showLowAmountDialog.value         = false
        _showNewCbSaveRequired.value       = false
        _showNoTaxReceiptWarningDialog.value = false
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Composable state snapshot
// ──────────────────────────────────────────────────────────────────────────────

/** Immutable snapshot of all four dialog visibility flags. */
data class PaymentDialogsState(
    val showPaymentDialog: Boolean,
    val showLowAmountDialog: Boolean,
    val showNoTaxReceiptWarningDialog: Boolean,
    val showNewCbSaveRequired: Boolean
)

/**
 * Collects all four StateFlows into a single [PaymentDialogsState].
 * Called once at the root of the Compose tree; individual sub-composables
 * receive the snapshot as a plain parameter — no StateFlow coupling below this point.
 */
@Composable
fun PaymentDialogsVM.usePaymentDialogsState() = PaymentDialogsState(
    showPaymentDialog              = showPaymentDialog.collectAsState().value,
    showLowAmountDialog            = showLowAmountDialog.collectAsState().value,
    showNoTaxReceiptWarningDialog  = showNoTaxReceiptWarningDialog.collectAsState().value,
    showNewCbSaveRequired          = showNewCbSaveRequired.collectAsState().value
)

// ──────────────────────────────────────────────────────────────────────────────
// Dialog parameter bundles
// ──────────────────────────────────────────────────────────────────────────────

data class LowAmountDialogParams(
    val suggestedAmount: Double,
    val currency: Currency,
    val onIncreaseAmountAndContinue: () -> Unit,
    val onContinueWithCurrentAmount: () -> Unit
)

data class NoTaxReceiptWarningDialogParams(
    val asso: Asso,
    val onContinueWithoutReceipt: () -> Unit
)

data class NewCbSaveRequiredDialogParams(
    val donationAmount: LiveData<Double>,
    val currency: Currency,
    val asso: Asso
)

// ──────────────────────────────────────────────────────────────────────────────
// Root Composable — dialog dispatcher
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Composable extension on FragmentWithPaymentDialogs.
 * Dispatches to the correct dialog based on [state].
 * At most one dialog is shown at a time — `when` guarantees mutual exclusion.
 *
 * Note: this function accesses `findNavController()` (Fragment API) because
 * the card registration dialog scopes its ViewModel to the nav graph.
 * This is the interop point where Compose meets the Fragment back-stack.
 */
@Composable
fun FragmentWithPaymentDialogs.PaymentDialogsUI(
    state: PaymentDialogsState,
    payload: SetupIntentPayload,
    lowAmountDialogParams: LowAmountDialogParams,
    noTaxReceiptWarningDialogParams: NoTaxReceiptWarningDialogParams,
    newCbSaveRequiredDialogParams: NewCbSaveRequiredDialogParams
) {
    when {
        state.showPaymentDialog -> {
            // CbSaver is scoped to the nav-graph so it survives internal navigation
            // (e.g. opening the Terms-of-Use tab from inside the dialog).
            val storeOwner = findNavController().getViewModelStoreOwner(R.id.nav_graph)
            val cbSaver = ViewModelProvider(storeOwner)[CbSaver::class.java]
            cbSaver.DialogCB(this, payload)
        }
        state.showLowAmountDialog -> vm.LowAmountDialog(lowAmountDialogParams)
        state.showNoTaxReceiptWarningDialog -> vm.NoTaxReceiptWarningDialog(noTaxReceiptWarningDialogParams)
        state.showNewCbSaveRequired -> vm.NewCbSaveRequiredDialog(newCbSaveRequiredDialogParams)
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Individual dialog Composables (extensions on PaymentDialogsVM)
// ──────────────────────────────────────────────────────────────────────────────

@Composable
fun PaymentDialogsVM.LowAmountDialog(p: LowAmountDialogParams) {
    CustomDialog(
        showDialogMutableState = _showLowAmountDialog,
        title           = stringResource(R.string.perouta_pop_title),
        message         = stringResource(R.string.perouta_pop_message, p.suggestedAmount, p.currency.symb),
        leftButtonText  = stringResource(R.string.continue_tseda),
        rightButtonText = stringResource(R.string.perouta_pop_right_button, p.suggestedAmount, p.currency.symb),
        onLeftButtonTap  = { p.onContinueWithCurrentAmount() },
        onRightButtonTap = { p.onIncreaseAmountAndContinue() }
    )
}

@Composable
fun PaymentDialogsVM.NoTaxReceiptWarningDialog(p: NoTaxReceiptWarningDialogParams) {
    CustomDialog(
        showDialogMutableState = _showNoTaxReceiptWarningDialog,
        message         = p.asso.taxReceiptCountriesPresentation(),
        rightButtonText = stringResource(R.string.continue_all_the_same),
        onRightButtonTap = { p.onContinueWithoutReceipt() }
    )
}

@Composable
fun PaymentDialogsVM.NewCbSaveRequiredDialog(p: NewCbSaveRequiredDialogParams) {
    CustomDialog(
        showDialogMutableState = _showNewCbSaveRequired,
        onDismiss       = {},
        title           = stringResource(R.string.save_cb_required_dialog_title),
        message         = stringResource(R.string.save_cb_required_dialog_message,
            p.donationAmount.value, p.currency.symb, p.asso.name),
        rightButtonText = stringResource(R.string.continue_tseda),
        onRightButtonTap = {
            _showNewCbSaveRequired.value = false
            openPaymentDialog()
        }
    )
}
