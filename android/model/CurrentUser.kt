// MARK: - Model Layer — CurrentUser
//
// CurrentUser is the canonical source of truth for all authenticated-user state.
//
// Design choices:
//  - Kotlin `object`: the language-level singleton. No getInstance(), no companion
//    object factory, no lazy initialisation boilerplate — just `CurrentUser.email`.
//  - Every property overrides User (the shared base) and routes reads/writes to
//    the correct store:
//      • SystemDataRetriever/Setter  — SharedPreferences, fast, offline-capable
//      • RemoteDataSetter            — Firestore, persisted across devices
//  - Remote writes are fire-and-forget coroutines (MainScope / IO scope).
//    The setter returns synchronously to the caller; the network call happens
//    in the background. This is the Android equivalent of iOS's `didSet` pattern.
//
// Compare with iOS CurrentUser.swift: same "smart property" pattern, different
// singleton idiom (Kotlin `object` vs Swift private static var + getInstance()).

@file:Suppress("RedundantVisibilityModifier")

package com.kikarov.tsedaclick.data_model

import com.kikarov.tsedaclick.activities.MainActivity
import com.kikarov.tsedaclick.ds_prefs.systemDataRetriever
import com.kikarov.tsedaclick.ds_prefs.systemDataSetter
import com.kikarov.tsedaclick.ds_remote.remoteDataRetriever
import com.kikarov.tsedaclick.ds_remote.remoteDataSetter
import com.kikarov.tsedaclick.objects.*
import com.kikarov.tsedaclick.stripe.StripeIdWithOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch

object CurrentUser : User() {

    // MARK: - Overridden properties

    override var uid: String
        get() = systemDataRetriever.uid()
        set(value) { systemDataSetter.setUID(value) }

    override var email: String
        get() = systemDataRetriever.email()
        set(value) {
            systemDataSetter.setEmail(value)
            MainScope().launch { remoteDataSetter.setEmail(value) } // fire-and-forget
        }

    override var currency: Currency
        get() = Currency.fromAny(systemDataRetriever.currency())
        set(value) {
            val str = value.name
            systemDataSetter.setCurrency(str)
            MainScope().launch { remoteDataSetter.setCurrency(str) }
        }

    override var stripeAccountsWithPM: List<StripeIdWithOwner>
        get() {
            val raw: List<Map<String, String>> = systemDataRetriever.stripeAccountsWithPM()
            return raw.mapNotNull { StripeIdWithOwner.fromMap(it) }
        }
        set(value) { systemDataSetter.setStripeAccountsWithPM(value.map { it.toMap() }) }

    override var paymentMethodDetails: PaymentMethodDetails
        get() = PaymentMethodDetails(systemDataRetriever.paymentMethodDetails())
        set(value) { systemDataSetter.setPaymentMethodDetails(value.toMap()) }

    // History is fetched by the HistoryVM and referenced here via the Activity.
    // This avoids holding a reference to a ViewModel inside a singleton.
    override fun payments(activity: MainActivity?)    = activity?.historyVM?.payments?.value
    override fun pendings(activity: MainActivity?)    = activity?.historyVM?.pendings?.value
    override fun promisesToPay(activity: MainActivity?) = activity?.historyVM?.promisesToPay?.value

    override var lastPaymentStatus: LastPaymentStatus
        get() = LastPaymentStatus.fromAny(systemDataRetriever.lastPaymentStatus())
        set(value) { systemDataSetter.setLastPaymentStatus(value.toString()) }

    override var taxReceiptAddress: TaxReceiptAddress
        get() = TaxReceiptAddress(systemDataRetriever.taxReceiptAddress())
        set(value) { systemDataSetter.setTaxReceiptAddress(value.toMap()) }

    override var taxReceiptFreq: TaxReceiptFreq
        get() = runCatching { TaxReceiptFreq.valueOf(systemDataRetriever.taxReceiptFreq()) }
            .getOrDefault(TaxReceiptFreq.DEFAULT())
        set(value) { systemDataSetter.setTaxReceiptFreq(value.toString()) }

    override var taxReceiptCountry: TaxReceiptCountry
        get() = runCatching { TaxReceiptCountry.valueOf(systemDataRetriever.taxReceiptCountry()) }
            .getOrDefault(TaxReceiptCountry.DEFAULT())
        set(value) { systemDataSetter.setTaxReceiptCountry(value.toString()) }

    override var okData: OkData
        get() = runCatching { OkData.valueOf(systemDataRetriever.okData()) }
            .getOrDefault(OkData.Undefined)
        set(value) {
            systemDataSetter.setOkData(value.toString())
            MainScope().launch { remoteDataSetter.saveCurrentUserOkData(value.toString()) }
        }

    override var hasApprovedLegalNotices: Boolean
        get() = systemDataRetriever.hasApprovedLegalNotices()
        set(value) {
            systemDataSetter.setHasApprovedLegalNotices(value)
            MainScope().launch { remoteDataSetter.saveCurrentUserHasApprovedLegalNotices(value) }
        }

    override var assoFavo: ArrayList<Asso>
        get() = systemAssoFavo(retriever = systemDataRetriever)
        set(value) {
            val deduped = value.withNoDuplicates()
            systemDataSetter.setAsSystemAssoFavo(array = deduped)
            CoroutineScope(Dispatchers.IO).launch {
                remoteDataSetter.updateAssoFavoArray(deduped.toIdArray())
            }
        }

    // MARK: - Asso favo helpers

    fun pushAsFirstAssoFavo(asso: Asso) {
        assoFavo = assoFavo.withFirstAsso(asso)
    }

    // MARK: - Tab bar state (driven by last payment status)

    fun setLastPaymentStatus(activity: MainActivity?, status: LastPaymentStatus) {
        lastPaymentStatus = status
        MainScope().launch { setMainActivityTabBar(activity) }
    }

    fun setMainActivityTabBar(activity: MainActivity?) = when (lastPaymentStatus) {
        LastPaymentStatus.OK            -> {
            if (pendings(activity)?.isEmpty() == false) activity?.setRequiresAuth()
            else activity?.setStandardBottomNav()
        }
        LastPaymentStatus.REQUIRES_AUTH -> activity?.setRequiresAuth()
        LastPaymentStatus.FAILED        -> activity?.setErrorBottomNav()
    }

    // MARK: - Misc persisted state

    var lastIndexSelectedInAssoFavoSeg: Int
        get() = systemDataRetriever.lastIndexSelectedInAssoFavoSeg()
        set(value) { systemDataSetter.setLastIndexSelectedInAssoFavoSeg(value) }

    var assosIdTaxCountryKnown: MutableSet<String>
        get() = systemDataRetriever.assosIdTaxCountryKnown() ?: mutableSetOf()
        set(value) { systemDataSetter.setAssosIdTaxCountryKnown(value) }

    fun pushAsAssoTaxCountryKnown(asso: Asso) {
        if (!asso.isTaxCountryKnown()) {
            assosIdTaxCountryKnown = assosIdTaxCountryKnown.also { it.add(asso.id.knownSuffixed()) }
        }
    }

}

// MARK: - Remote data bootstrapping (called from MainActivity.onCreate)

fun retrieveAndSetCurrentUserLaunchingRemoteData(activity: MainActivity, completion: () -> Unit = {}) {
    MainScope().launch {
        val data = remoteDataRetriever.currentUserData(activity)

        @Suppress("UNCHECKED_CAST")
        fun <T> key(k: String): T? = data?.get(k) as? T

        CurrentUser.currency = Currency.fromAny(key<String>(USER_KEY_CURRENCY))

        val pmDetails = key<Map<String, Any>>(USER_KEY_PAYMENT_METHOD_DETAILS)
        CurrentUser.paymentMethodDetails = PaymentMethodDetails(pmDetails)

        val status = key<String>(USER_KEY_LAST_PAYMENT_STATUS)
        CurrentUser.setLastPaymentStatus(activity, LastPaymentStatus.fromAny(status))

        val rawAccounts = key<List<*>>(USER_KEY_STRIPE_ACCOUNTS_WITH_PM)
        CurrentUser.stripeAccountsWithPM = StripeIdWithOwner.listFromRaw(rawAccounts)

        val assoFavoArrayId = key<ArrayList<String>>(USER_KEY_ASSO_FAVO_ID_ARRAY)
        CurrentUser.assoFavo = assoFavoArrayId.toAssoArray()
        activity.sessionVM.assoFavoArray.value = CurrentUser.assoFavo

        val map = key<Map<String, String>>(USER_KEY_TAX_RECEIPT_ADDRESS)
        CurrentUser.taxReceiptAddress = map?.let { TaxReceiptAddress(it) } ?: TaxReceiptAddress.DEFAULT()

        completion()
    }
}
