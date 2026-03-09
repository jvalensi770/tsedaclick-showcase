// MARK: - ViewModel — TsedakaSessionVM
//
// Holds the mutable state for the main donation screen:
//   - which asso is selected (from the user's favourites list)
//   - the current donation amount
//   - the live favourites array (updated after each remote fetch)
//
// Design choices:
//  - Extends AndroidX `ViewModel`: survives configuration changes, scoped to the
//    Activity, shared across all fragments via `activityViewModels()`.
//  - LiveData over StateFlow here: the Fragment observers use `observe(viewLifecycleOwner)`,
//    which is lifecycle-aware and automatically stops on STOP — safer than
//    `collectAsState` in a non-Compose context.
//  - `donationAmount` is private MutableLiveData / public LiveData: enforces
//    single-write-path through `onDonationAmountChange()`, where the cap logic lives.
//  - `pushAsFirstAssoFavo(assoId)` is a `suspend fun`: it fetches the full Asso
//    (with Stripe accounts) from Firestore before inserting it at the head of the list.
//    Callers launch it from a coroutine scope; the VM never manages its own scope here.

package com.kikarov.tsedaclick.data_model

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.kikarov.tsedaclick.ds_remote.remoteDataRetriever
import com.kikarov.tsedaclick.objects.Asso
import com.kikarov.tsedaclick.objects.INFINITY
import com.kikarov.tsedaclick.objects.INFINITY_MINUS_ONE
import com.kikarov.tsedaclick.objects.withFirstAsso
import extensions.getSafety

// Top-level var: captures the amount at payment time in case the user
// resets the field before the async payment call returns.
var topDonationAmount: Double = 0.0

class TsedakaSessionVM : ViewModel() {

    // MARK: - Donation amount

    private val _donationAmount = MutableLiveData(0.0)
    val donationAmount: LiveData<Double> = _donationAmount

    fun onDonationAmountChange(newAmount: Double) {
        _donationAmount.value = if (newAmount >= INFINITY) INFINITY_MINUS_ONE else newAmount
        topDonationAmount = _donationAmount.value ?: 0.0
    }

    fun addToDonationAmount(toAdd: Double) {
        onDonationAmountChange((_donationAmount.value ?: 0.0) + toAdd)
    }

    fun setDonationToPeroutaSuggestedAmount() {
        onDonationAmountChange(CurrentUser.currency.lowAmount)
    }

    fun resetDonationAmount() = onDonationAmountChange(0.0)

    fun amountIsNotZeroNorNull() = (_donationAmount.value ?: 0.0) != 0.0

    // MARK: - Asso selection

    var assoSelected = MutableLiveData(lastAssoFavoSelected())
    var assoFavoArray = MutableLiveData(CurrentUser.assoFavo)

    private fun lastAssoFavoSelected(): Asso =
        CurrentUser.assoFavo.getSafety(CurrentUser.lastIndexSelectedInAssoFavoSeg) ?: Asso()

    /** Fetches the full Asso (with Stripe accounts) then pushes it to the front of favourites. */
    suspend fun pushAsFirstAssoFavo(assoId: String) {
        pushAsFirstAssoFavo(remoteDataRetriever.assoWithStripeAccounts(assoId))
    }

    fun pushAsFirstAssoFavo(asso: Asso) {
        assoFavoArray.value = assoFavoArray.value?.withFirstAsso(asso)
    }

    // MARK: - Reset

    fun reset() {
        resetDonationAmount()
        assoFavoArray.value = arrayListOf()
        assoSelected.value = Asso()
    }

}
