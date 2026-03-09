// MARK: - Model Layer — CurrentUser
//
// CurrentUser is a singleton that represents the authenticated user.
// It inherits from the base User class and overrides every property
// to proxy reads/writes through two data sources:
//
//   - SystemDataSource  (UserDefaults): fast, offline-capable, local cache
//   - RemoteDataSource  (Firestore):    persistent, synced across devices
//
// This "smart property" pattern means callers never need to know where data
// lives — they just read/write CurrentUser and the right store is used.
//
// Properties that must propagate to Firestore trigger the remote write inside
// their setter. Properties that only need local persistence don't.
// UI state changes are broadcast via NSNotification (InAppNotif) so that
// any interested ViewController can react without tight coupling.

import Foundation
import FirebaseAuth

class CurrentUser: User {

    private static var currentUser: CurrentUser?

    // MARK: - Overridden properties (system + optional remote sync)

    override var uid: String? {
        get { SystemDataSource.retriever.uid() }
        set { SystemDataSource.setter.setUID(newValue) }
    }

    override var email: String? {
        get { SystemDataSource.retriever.email() }
        set {
            SystemDataSource.setter.setEmail(newValue)
            RemoteDataSource.setter.updateCurrentUserEmail(newValue) // synced to Firestore
        }
    }

    override var currency: Currency {
        get { CurrencyEnum(rawValue: SystemDataSource.retriever.strCurrency())?.currency() ?? CurrencyEnum.DEFAULT().currency() }
        set { SystemDataSource.setter.setCurrency(newValue.rawValue()) }
    }

    override var stripeAccountsWithPM: [StripeIdWithOwner]? {
        get { SystemDataSource.retriever.stripeAccountsWithPM()?.compactMap { StripeIdWithOwner(from: $0) } }
        set { SystemDataSource.setter.setStripeAccountsWithPM(newValue?.compactMap { $0.toDictionary() }) }
    }

    override var paymentMethodsDetails: [PaymentMethodDetails]? {
        get { SystemDataSource.retriever.paymentMethodsDetails()?.compactMap { PaymentMethodDetails.from($0) } }
        set { SystemDataSource.setter.setPaymentMethodsDetails(newValue?.compactMap { $0.toDictionary() }) }
    }

    override var lastPaymentStatus: LastPaymentStatus? {
        get { LastPaymentStatus(rawValue: SystemDataSource.retriever.lastPaymentStatus()) }
        set { SystemDataSource.setter.setLastPaymentStatus(newValue?.rawValue) }
    }

    override var taxReceipt: TaxReceipt? {
        get { SystemDataSource.retriever.taxReceipt()?.toTaxReceipt() }
        set { SystemDataSource.setter.setTaxReceipt((newValue ?? TaxReceipt()).toSystemJSON()) }
    }

    override var phoneNumber: PhoneNumber? {
        get { SystemDataSource.retriever.phoneNumber()?.toPhoneNumber_SystemKeys() }
        set { SystemDataSource.setter.setPhoneNumber(newValue?.toSystemJSON()) }
    }

    override var timeZone: String? {
        get { SystemDataSource.retriever.timeZone() }
        set { guard let v = newValue else { return }; SystemDataSource.setter.setTimeZone(v) }
    }

    override var okData: OkData? {
        get { SystemDataSource.retriever.boolOkData().toOkData() }
        set {
            let v = newValue ?? OkData.DEFAULT()
            SystemDataSource.setter.setOkData(v.toBool())
            RemoteDataSource.setter.updateCurrentUserOkData(v.rawValue) // synced to Firestore
        }
    }

    override var assoFavoArray: [Asso]? {
        get {
            var arr = SystemDataSource.retriever.assoFavoArray().toAsso()
            arr.removeDuplicates()
            return arr
        }
        set {
            var arr = newValue ?? []
            arr.removeDuplicates()
            SystemDataSource.setter.setAssoFavoArray(arr.toSystemJSON())
            InAppNotif.sendNotif(name: InAppNotif.CURRENT_USER_ASSOFAVO_CHANGED)
        }
    }

    // MARK: - Singleton

    public static func getInstance() -> CurrentUser {
        if currentUser == nil { currentUser = self.init() }
        return currentUser!
    }

    public static func reset() { currentUser = self.init() }

}

// MARK: - Auth & remote data bootstrapping

extension CurrentUser {

    /// Authenticates anonymously (Firebase Auth) then loads the user document from Firestore.
    public static func authentifyThenRetrieveAndSetLaunchingRemoteData(withEmail email: String?) {
        // Auth completion runs even in offline mode — unlike Firestore listeners.
        FbAuth.authenticate(withEmail: email) { authDataResult, error in
            if let error, error.isDueToUserDeleted() {
                return AppDelegateIntents.resetAllSystemFieldsAndCreateUser()
            }
            retrieveAndSetLaunchingRemoteData()
        }
    }

    public static func retrieveAndSetLaunchingRemoteData() {
        RemoteDataSource.retriever.retrieveCurrentUserDocData(
            completion: RemoteDataSource.reader.setCurrentUserLaunchingRemoteData()
        )
        RemoteDataSource.retriever.retrieveHasMadeOnePromise(
            completion: CurrentUser.setHasMadeOnePromise
        )
    }

}

// MARK: - Currency

extension CurrentUser {

    /// Sets currency locally and notifies observers. Also syncs to Firestore.
    public static func setCurrency(_ currency: Currency) {
        guard getInstance().currency.rawValue() != currency.rawValue() else { return }
        getInstance().currency = currency
        InAppNotif.sendNotif(name: InAppNotif.CURRENT_USER_CURRENCY_CHANGED)
        RemoteDataSource.setter.updateCurrentUserCurrency(currency.rawValue())
    }

}

// MARK: - Payment method & Stripe

extension CurrentUser {

    public static func hasTsedaclickPaymentMethod() -> Bool {
        getInstance().stripeAccountsWithPM?.contains { if case .tseda = $0 { return true }; return false } ?? false
    }

    public static func hasAnyPaymentMethod() -> Bool {
        !(getInstance().stripeAccountsWithPM?.isEmpty ?? true)
    }

    /// True if the user has a payment method attached to a specific asso's Stripe account.
    public static func hasPaymentMethodToPay(_ asso: Asso) -> Bool {
        getInstance().stripeAccountsWithPM?.contains { pm in
            if case .asso(_, let ownerId) = pm { return ownerId == asso.id }
            return false
        } ?? false
    }

}

// MARK: - Payment debit eligibility rule
//
// Debits the user only when the accumulated promise amount justifies the Stripe
// fee overhead, or enough time has passed since the last payment.

extension CurrentUser {

    static func itIsTimeToDebit(amount promisesAmount: Double, delay delaySinceLastPayment: Int) -> Bool {
        (promisesAmount >= 5.00) ||                                          // always debit above 5 €
        (promisesAmount >= 2.50 && delaySinceLastPayment > 604_800)  ||     // 2.5 € after 1 week
        (promisesAmount >= 1.25 && delaySinceLastPayment > 1_209_600) ||    // 1.25 € after 2 weeks
        (promisesAmount >= 0.50 && delaySinceLastPayment > 2_419_200)       // 0.5 € after 4 weeks
    }

}

// MARK: - Recurring helpers

extension CurrentUser {

    public static func hasDailyRecurrings()   -> Bool { hasRecurrings(ofFreq: .DAILY) }
    public static func hasWeeklyRecurrings()  -> Bool { hasRecurrings(ofFreq: .WEEKLY) }
    public static func hasMonthlyRecurrings() -> Bool { hasRecurrings(ofFreq: .MONTHLY) }

    private static func hasRecurrings(ofFreq freq: RecurringFreq) -> Bool {
        getInstance().recurrings?.containsOneRecurring(ofFreq: freq) ?? false
    }

    public static func recurrings(ofFreq freq: RecurringFreq) -> [Recurring] {
        getInstance().recurrings?.array(ofFreq: freq) ?? []
    }

    public static func higherFreq() -> RecurringFreq {
        if hasMonthlyRecurrings() { return .MONTHLY }
        if hasWeeklyRecurrings()  { return .WEEKLY  }
        return .DAILY
    }

    /// Sync the user's timezone to Firestore if it changed since last launch.
    public static func updateRemoteRecurringsTimeZoneIfChanged() async {
        let current = TimeZone.current.identifier
        guard current != getInstance().timeZone else { return }
        getInstance().timeZone = current
        await RemoteDataSource.setter.setCurrentUserRecurringsTimeZone(current)
    }

}
