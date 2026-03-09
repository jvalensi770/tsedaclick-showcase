// MARK: - Data Layer — Remote Data Protocols
//
// Protocol-based abstraction over the Firestore data source.
// The app interacts with remote data exclusively through these protocols —
// never through a concrete FirestoreDataSource reference.
//
// Benefits:
//  - ViewControllers and ViewModels are testable without a live Firestore instance
//  - The underlying implementation (Firestore, mock, local JSON…) is swappable
//  - Each protocol has a single responsibility (setter / retriever / reader / ref)
//
// Pattern: RemoteDataSource.setter / .retriever / .reader are the facade singletons
// that hold the concrete implementation. Callers only see the protocol.

import Foundation
import UIKit

// MARK: - Write operations

public protocol RemoteDataSetter {

    func saveCurrentUserPromise(_ promise: Promise)
    func updateAssoFavoArray(_ assoIdArray: [String])
    func updateCurrentUserEmail(_ email: String?)
    func updateCurrentUserCurrency(_ currency: String)
    func updateCurrentUserTaxReceiptAddress(_ address: [String: String]?)
    func updateCurrentUserTaxReceiptCountry(_ country: String?)
    func updateCurrentUserTaxReceiptFreq(_ freq: String?)
    func updateCurrentUserOkData(_ okDataRawValue: String)
    func updateCurrentUserPhoneNumber(_ phoneNumber: [String: Any]) async
    func addTokenFCM(_ tokenFCM: String)
    func addUserChangeRequestRef(type: String, contact: String) async -> Any?
    func setRecurring(_ recurring: [String: Any]?) async
    func setRecurringIsActive(id: String, bool: Bool) async
    func setCurrentUserRecurringsTimeZone(_ timeZone: String) async
    func deleteRecurring(id: String) async

}

// MARK: - Read operations (one-shot fetches)

public protocol RemoteDataRetriever {

    func retrieveCurrentUserDocData(completion: Any?)
    func retrieveHasMadeOnePromise(completion: ((Bool) -> Void)?)
    func retrieveAssoData(assoId: String, completion: Any?)
    func retrieveAssoDataWithStripeAccounts(assoId: String, completion: Any?)
    func retrieveAssosDisplayed(completion: Any?)
    func retrieveAssosDisplayedAndCurrentUserAccessed(completion: Any?)
    func retrieveAssoDescription(_ assoId: String, langage: String, completion: Any?)
    func retrieveTextDesc(_ docId: String, langage: String, completion: Any?)
    func retrieveTitles(_ docId: String, langage: String, completion: Any?)
    func retrieveCorrPromises(_ paymentIntentId: String, completion: Any?)
    func corrPromise(status: String?, id paymentIntentId: String?) async -> [[String: Any]]
    func retrieveCustomerServicePhoneNumber(completion: Any?)
    func retrieveCustomerServiceWhatsAppNumber(completion: Any?)
    func retrieveStripeAPIKey(_ country: String, completion: Any?)

}

// MARK: - Real-time listeners (returns a listener handle)

public protocol RemoteDataReader {

    func setCurrentUserLaunchingRemoteData() -> Any
    func setCurrentUserPaymentMethodDetails() -> Any
    func setCurrentUserLastPaymentStatus() -> Any
    func setAssoRetrieved(_ vc: ViewControllerRetrievingAssoData) -> Any
    func setAllAssosDataAndNotify() -> Any
    func setInAssoFavoArray() -> Any
    func setAssoDescription(_ assoDescSetter: AssoDescSetter) -> Any
    func setTextDesc(_ textDescSetter: RemoteTextViewSetter) -> Any
    func setTitles(_ textDescSetter: RemoteTextViewSetter) -> Any
    func setCorrPromiseArray(_ paymentIntentId: String) -> Any
    func setCustomerServicePhoneNumber() -> Any
    func setCustomerServiceWhatsAppNumber() -> Any
    func setStripeAPIKey(_ country: String, _ completion: (() -> Void)?) -> Any

}

// MARK: - Document references (for attaching listeners)

public protocol RemoteDataRef {
    func currentUserDoc() -> Any
    func currentUserRecurrings() -> Any
    func currentUserPromisesToPay() -> Any
    func currentUserPendings() -> Any
    func currentUserPayments() -> Any
}

extension RemoteDataRef {
    /// Convenience: resolve the right collection from a PaymentStatus value
    func currentUserPayments(forStatus status: PaymentStatus) -> Any? {
        switch status {
        case .SUCCESSFUL: return currentUserPayments()
        case .PENDING:    return currentUserPendings()
        case .NONE:       return nil
        }
    }
}

// MARK: - Delegate protocol for asso retrieval

/// Implemented by any ViewController that triggers an asso fetch and needs the result.
public protocol ViewControllerRetrievingAssoData {
    func setAssoRetrieved(asso: Asso)
}
