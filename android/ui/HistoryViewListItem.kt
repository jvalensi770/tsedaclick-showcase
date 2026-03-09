// MARK: - UI Layer — HistoryViewListItem
//
// Sealed class whose subclasses represent every row type in the history list.
//
// This is one of the most Kotlin-idiomatic files in the codebase:
//
//  1. Sealed class as discriminated union: the compiler enforces exhaustive `when`
//     on the hierarchy. New row types = new subclasses; the compiler points to every
//     `when` that needs updating.
//
//  2. Abstract @Composable methods: each subclass owns its rendering logic.
//     The shared `CardViewItem()` composable calls `LeftBottomComposable()` and
//     `RightBottomComposable()` as polymorphic slots — the equivalent of a render
//     prop or a slot API in other frameworks.
//
//  3. Compose + Fragment interop: `CardViewItem` receives `parentFrag: Fragment` so
//     it can trigger navigation (`findNavController()`) from inside a composable.
//     This is standard Compose-in-Fragment interop on Android.
//
//  4. `remember { mutableStateOf(false) }` for local ephemeral state (show/hide the
//     debit-info dialog) that doesn't need to survive recomposition, device rotation,
//     or process death — the right scope for UI-only toggles.

package com.kikarov.tsedaclick.views

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.ClickableText
import androidx.compose.material.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.kikarov.tsedaclick.R
import com.kikarov.tsedaclick.activities.MainActivity
import com.kikarov.tsedaclick.activities.fragments.Frag3_HistoryDirections
import com.kikarov.tsedaclick.data_model.CurrentUser
import com.kikarov.tsedaclick.firebase.RemoteFunctions
import com.kikarov.tsedaclick.objects.Payment
import com.kikarov.tsedaclick.objects.Promise
import com.kikarov.tsedaclick.objects.TaxReceiptFreq
import com.kikarov.tsedaclick.objects.deductiblePart
import com.kikarov.tsedaclick.objects.total
import com.kikarov.tsedaclick.presentation.RobotoTypography
import com.kikarov.tsedaclick.presentation.SystemBlue
import extensions.to2DecimalsStr
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

sealed class HistoryViewListItem {

    // MARK: - Subclasses

    /** Unpaid promises — a debit is coming soon. */
    class PromisesToPayItem(val promisesToPayArray: List<Promise>) : HistoryViewListItem() {
        override val totalAmount     get() = promisesToPayArray.total()
        override val deductibleAmount get() = promisesToPayArray.deductiblePart()
        override val corrPromises    get() = promisesToPayArray.toTypedArray()

        // Local state for the "when will I be debited?" info dialog.
        // `remember` keeps this alive across recompositions of this item.
        private val showDebitDialog = mutableStateOf(false)

        @Composable override fun dateStr() = stringResource(R.string.soon_debited)

        @Composable override fun LeftBottomComposable(modifier: Modifier) {
            if (showDebitDialog.value) { DebitInfoDialog() }
            ClickableText(
                modifier = modifier,
                style    = RobotoTypography.subtitle1,
                text     = AnnotatedString(
                    stringResource(R.string.debit_freq_title),
                    spanStyle = SpanStyle(textDecoration = TextDecoration.Underline)
                ),
                onClick = { showDebitDialog.value = true }
            )
        }

        @Composable
        private fun DebitInfoDialog() {
            AlertDialog(
                onDismissRequest = { showDebitDialog.value = false },
                title = { Row(Modifier.fillMaxWidth()) {
                    Text(stringResource(R.string.debit_freq_title), style = RobotoTypography.h2)
                } },
                text = { Text(
                    stringResource(R.string.debit_freq_message),
                    style = RobotoTypography.body1,
                    textAlign = TextAlign.Justify,
                    color = colorResource(R.color.black)
                ) },
                buttons = {
                    Row(Modifier.fillMaxWidth().padding(10.dp),
                        horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showDebitDialog.value = false }) {
                            Text(stringResource(R.string.ok),
                                color = SystemBlue, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            )
        }

        @Composable override fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier) {}
    }

    /** Unpaid promises where the last debit attempt failed. */
    class PromisesFailedItem(val promisesToPayArray: List<Promise>) : HistoryViewListItem() {
        override val totalAmount      get() = promisesToPayArray.total()
        override val deductibleAmount get() = promisesToPayArray.deductiblePart()
        override val corrPromises     get() = promisesToPayArray.toTypedArray()

        @Composable override fun dateStr() = stringResource(R.string.debit_failed)

        @Composable override fun LeftBottomComposable(modifier: Modifier) {
            Text(
                style     = RobotoTypography.subtitle2,
                modifier  = modifier.fillMaxWidth(0.6f),
                text      = stringResource(R.string.debit_failed_message),
                textAlign = TextAlign.Justify
            )
        }

        /** "Try again" button — shows a spinner while the retry is in flight. */
        @Composable override fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier) {
            val showProgress = remember { mutableStateOf(false) }
            if (!showProgress.value) {
                Button(
                    onClick = {
                        showProgress.value = true
                        CoroutineScope(Dispatchers.IO).launch {
                            RemoteFunctions.callPayPromises(parentFrag.activity as? MainActivity)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        backgroundColor = colorResource(R.color.red),
                        contentColor    = colorResource(R.color.White)
                    )
                ) { Text(stringResource(R.string.try_again)) }
            } else {
                CircularProgressIndicator()
            }
        }
    }

    /** A payment that has been initiated but not yet settled by the bank. */
    class PendingItem(val parentFrag: Fragment, val pending: Payment) : HistoryViewListItem() {
        override val totalAmount      get() = pending.amount
        override val deductibleAmount get() = pending.promiseArray.deductiblePart()
        override val corrPromises     get() = pending.promiseArray?.toTypedArray() ?: emptyArray()

        @Composable override fun dateStr() = stringResource(R.string.pending)
        @Composable override fun LeftBottomComposable(modifier: Modifier) {}

        /** Opens the 3DS validation link in the browser. */
        @Composable override fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier) {
            Button(
                onClick = { parentFrag.requireContext().openUrl(pending.urlPending?.withoutCommas()) },
                colors  = ButtonDefaults.buttonColors(
                    backgroundColor = colorResource(R.color.orange),
                    contentColor    = colorResource(R.color.White)
                )
            ) { Text(stringResource(R.string.validation_link)) }
        }
    }

    /** A successfully settled payment. */
    class PaymentItem(val payment: Payment) : HistoryViewListItem() {
        override val totalAmount      get() = payment.amount
        override val deductibleAmount get() = payment.promiseArray.deductiblePart()
        override val corrPromises     get() = payment.promiseArray?.toTypedArray() ?: emptyArray()

        @Composable override fun dateStr() = payment.date.toShortStr()

        @Composable override fun LeftBottomComposable(modifier: Modifier) {
            Text(modifier = modifier, style = RobotoTypography.subtitle1,
                text = payment.pmSmallDesc().firstLetterUppercased())
        }

        /**
         * Tax receipt button — shows different states based on
         * (receipt sent, frequency preference, tax-deductibility of the promises).
         */
        @Composable override fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier) {
            val activity = LocalContext.current.getActivity() as MainActivity
            when {
                noneIsDeductible()                             -> Unit
                !CurrentUser.hasDefinedTaxReceiptAddress()     -> {
                    Button(onClick = {
                        parentFrag.findNavController().navigate(
                            Frag3_HistoryDirections.actionBottomBarIcon3ToBottomBarIcon2(),
                            parentFrag.popUpToParentFragNavOption()
                        )
                    }) { Text(stringResource(R.string.receive_tax_receipt)) }
                }
                payment.taxReceiptSent && payment.taxReceiptIsYearly -> {
                    Button(onClick = { onTaxReceiptButtonClick(activity) }) {
                        Text(stringResource(R.string.tax_receipt_yearly, payment.date.year()))
                    }
                }
                payment.taxReceiptSent -> {
                    Button(onClick = { onTaxReceiptButtonClick(activity) }) {
                        Text(stringResource(R.string.tax_receipt))
                    }
                }
                CurrentUser.taxReceiptFreq == TaxReceiptFreq.YEARLY -> {
                    Text(stringResource(R.string.tax_receipt_to_send, (payment.date.year() + 1).toString()))
                }
                CurrentUser.taxReceiptFreq == TaxReceiptFreq.EACH -> {
                    CircularProgressIndicator()
                }
            }
        }

        private fun onTaxReceiptButtonClick(activity: MainActivity) {
            val tempUri = newInternalFileUri()
            cloudDataRetriever
                .downloadFileToUri(payment.taxReceiptPath ?: "", tempUri)
                .addOnSuccessListener {
                    activity.startSaveFileActivity(
                        MainActivity.DeviceFileSaver(activity, tempUri, payment.taxReceiptNameToSuggest())
                    )
                }
        }
    }

    /** Year separator row — shows the year and annual totals. */
    class PaymentHeaderItem(
        val currentYear: Int,
        override val totalAmount: Double,
        override val deductibleAmount: Double
    ) : HistoryViewListItem() {
        override val corrPromises = emptyArray<Promise>()

        @Composable override fun dateStr() = ""
        @Composable override fun LeftBottomComposable(modifier: Modifier) {}
        @Composable override fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier) {}

        @Composable override fun CardViewItem(parentFrag: Fragment) {
            Row(
                modifier = Modifier.fillMaxWidth().height(60.dp)
                    .padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(currentYear.toString(), style = RobotoTypography.h1)
                Spacer(Modifier.weight(1f))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(totalAmountStr(), style = RobotoTypography.h1)
                    Text(deductibleAmountStr(), style = RobotoTypography.h2)
                }
            }
        }
    }

    // MARK: - Abstract interface (implemented by every subclass)

    abstract val totalAmount: Double
    abstract val deductibleAmount: Double
    abstract val corrPromises: Array<Promise>

    @Composable abstract fun dateStr(): String
    @Composable abstract fun LeftBottomComposable(modifier: Modifier)
    @Composable abstract fun RightBottomComposable(parentFrag: Fragment, modifier: Modifier)

    // MARK: - Shared helpers

    fun noneIsDeductible() = deductibleAmount == 0.0

    @Composable
    fun totalAmountStr() = stringResource(
        R.string.amount_currencied, totalAmount.to2DecimalsStr(), CurrentUser.currency.symb)

    @Composable
    fun deductibleAmountStr(): String {
        val isAll = totalAmount.to2DecimalsStr() == deductibleAmount.to2DecimalsStr()
        return when {
            isAll              -> stringResource(R.string.deductible)
            noneIsDeductible() -> stringResource(R.string.not_deductible)
            else               -> stringResource(R.string.part_deductible,
                deductibleAmount.to2DecimalsStr(), CurrentUser.currency.symb)
        }
    }

    // MARK: - Shared card layout
    // Subclasses override this only for structurally different rows (PaymentHeaderItem).

    @Composable
    open fun CardViewItem(parentFrag: Fragment) {
        val topTitle = topTitleDetailsFrag()
        val activity = LocalContext.current.getActivity() as MainActivity

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp)
                .clickable {
                    activity.argsVM.corrPromisesDisplayed.value = corrPromises
                    parentFrag.findNavController().navigate(
                        Frag3_HistoryDirections.openHistDetails(topTitle),
                        parentFrag.popUpToParentFragNavOption()
                    )
                }
        ) {
            Column(Modifier.padding(horizontal = 20.dp, vertical = 15.dp)) {
                Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
                    Text(dateStr(), style = RobotoTypography.h2,
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.weight(1f))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(totalAmountStr(), style = RobotoTypography.h2)
                        Text(deductibleAmountStr(), style = RobotoTypography.body1)
                    }
                }
                Spacer(Modifier.weight(1f))
                Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.fillMaxWidth()) {
                    LeftBottomComposable(Modifier)
                    Spacer(Modifier.weight(1f))
                    RightBottomComposable(parentFrag, Modifier)
                }
            }
        }
    }

    // topTitleDetailsFrag is @Composable because it calls stringResource — Compose-only API.
    @Composable
    open fun topTitleDetailsFrag(): String = ""
}
