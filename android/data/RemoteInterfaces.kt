// MARK: - Data Layer — Remote Data Interfaces
//
// Protocol-based abstraction over the Firestore data source.
// All remote I/O is hidden behind these two interfaces; the rest of the app
// never imports Firebase directly.
//
// Key Kotlin idioms:
//  - Every method is `suspend`: callers use coroutines, no callbacks.
//    The concrete implementation (RemoteDataFbFirestore) converts Firestore Tasks
//    to coroutines with `.await()` from kotlinx-coroutines-play-services.
//  - Interfaces are injected at the call sites via top-level `val` properties
//    (see bottom of file). In tests, replace those properties with mock objects.
//
// Compare with the iOS counterpart (RemoteProtocols.swift): same split by
// responsibility (retriever vs setter), different concurrency model
// (suspend/coroutines here vs completion closures there).

@file:Suppress("RedundantVisibilityModifier")

package com.kikarov.tsedaclick.ds_remote

import com.kikarov.tsedaclick.activities.MainActivity
import com.kikarov.tsedaclick.objects.Asso
import com.kikarov.tsedaclick.objects.Payment
import com.kikarov.tsedaclick.objects.PaymentStatus
import com.kikarov.tsedaclick.objects.Promise

// MARK: - Read operations (one-shot fetches)

public interface RemoteDataRetriever {

    suspend fun currentUserData(activity: MainActivity): MutableMap<String, Any>?
    suspend fun assoWithStripeAccounts(assoId: String): Asso
    suspend fun allAssos(): Set<Asso>
    suspend fun allAssosCurrentUserAccessed(): Set<Asso>
    suspend fun currentUserPromisesToPay(): List<Promise>
    suspend fun currentUserSuccessfulPayments(): List<Payment>
    suspend fun currentUserPendingPayments(): List<Payment>
    suspend fun corrPromises(status: PaymentStatus, paymentIntentId: String): List<Promise>
    suspend fun assoDesc(assoId: String?, langage: String): String?
    suspend fun customerServicePhone(isoCode: String?): String?
    suspend fun customerServiceWhatsApp(isoCode: String?): String?
    suspend fun legalNoticesTitles(type: String, langage: String): MutableMap<String, Any>?
    suspend fun legalNoticesContents(type: String, langage: String): MutableMap<String, Any>?
    suspend fun stripePublishableAPIKey(country: String): String

}

// MARK: - Write operations

public interface RemoteDataSetter {

    suspend fun setEmail(email: String)
    suspend fun setCurrency(currency: String)
    suspend fun saveCurrentUserPromise(promise: Map<String, Any>)
    suspend fun saveCurrentUserTaxReceiptAddress(address: Map<String, String>)
    suspend fun saveCurrentUserTaxReceiptFreq(freq: String)
    suspend fun saveCurrentUserTaxReceiptCountry(country: String)
    suspend fun saveCurrentUserOkData(okData: String)
    suspend fun saveCurrentUserHasApprovedLegalNotices(approved: Boolean)
    suspend fun addNewTokenFCM(tokenFCM: String)
    suspend fun updateAssoFavoArray(assoIdArray: ArrayList<String>)
    suspend fun updatePaymentMethodsMap(pmMap: Map<String, String>)
    suspend fun updateCurrentUserPaymentMethodId(id: String?)
    suspend fun updateCurrentUserPaymentMethodDetails(details: Map<String, Any?>?)

}

// MARK: - Injection points
// Production implementations are assigned at app startup (Application.onCreate).
// Tests replace these with mocks without touching the classes that use them.

lateinit var remoteDataRetriever: RemoteDataRetriever
lateinit var remoteDataSetter: RemoteDataSetter
