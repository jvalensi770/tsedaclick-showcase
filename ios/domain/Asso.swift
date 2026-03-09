// MARK: - Domain Layer — Asso
//
// The Asso struct is the main domain object for a nonprofit association.
//
// Design choices:
//  - Value type (struct) — copied, not shared. No aliasing bugs.
//  - Equatable by id only — two instances with the same id represent the same asso,
//    regardless of whether their data has been fetched yet (name may be empty).
//  - Extensions split by concern: tax receipts, array helpers, serialization.
//  - System JSON keys are static constants on the struct — colocated with the type
//    that owns them, refactorable without touching raw strings elsewhere.

import Foundation

let ASSO_FIELDS_DEFAULT_VALUE = ""

public struct Asso {

    var id:                       String
    var name:                     String?
    var nameLangage:              String?   // language code of `name`, e.g. "fr"
    var mainCatego:               String?
    var subCatego:                String?
    var address:                  String?
    var website:                  String?
    var desc:                     String?
    var arrayCountryTaxDeductible: [TaxReceiptCountry]?
    var stripeAccounts:           [StripeAccount]?

    internal init(
        id:                        String? = ASSO_FIELDS_DEFAULT_VALUE,
        name:                      String? = ASSO_FIELDS_DEFAULT_VALUE,
        nameLangage:               String? = ASSO_FIELDS_DEFAULT_VALUE,
        mainCatego:                String? = ASSO_FIELDS_DEFAULT_VALUE,
        subCatego:                 String? = ASSO_FIELDS_DEFAULT_VALUE,
        address:                   String? = ASSO_FIELDS_DEFAULT_VALUE,
        website:                   String? = ASSO_FIELDS_DEFAULT_VALUE,
        desc:                      String? = ASSO_FIELDS_DEFAULT_VALUE,
        arrayCountryTaxDeductible: [TaxReceiptCountry]? = nil,
        stripeAccounts:            [StripeAccount]? = nil
    ) {
        self.id = id ?? ASSO_FIELDS_DEFAULT_VALUE
        self.name = name
        self.nameLangage = nameLangage
        self.mainCatego = mainCatego
        self.subCatego = subCatego
        self.address = address
        self.website = website
        self.desc = desc
        self.arrayCountryTaxDeductible = arrayCountryTaxDeductible
        self.stripeAccounts = stripeAccounts
    }

    // MARK: Domain predicates

    func deliversTaxReceiptForCurrentUser() -> Bool {
        guard let countries = arrayCountryTaxDeductible else { return false }
        return countries.contains(CurrentUser.assumedTaxResidenceCountry())
    }

    func hasEmptyName() -> Bool { name == ASSO_FIELDS_DEFAULT_VALUE }
    func hasName()      -> Bool { !hasEmptyName() }
    func hasEmptyId()   -> Bool { id == "" }
    func hasId()        -> Bool { !hasEmptyId() }

    func isKnownAsNotDeliveringTaxReceipt() -> Bool {
        CurrentUser.getInstance().assosIdTaxCountryKnown?.contains(id) ?? false
    }

    func hasStripeAccount() -> Bool {
        !(stripeAccounts?.isEmpty ?? true)
    }

}

// MARK: - Equatable — identity by id

extension Asso: Equatable {
    public static func == (lhs: Asso, rhs: Asso) -> Bool {
        lhs.id == rhs.id
    }
}

// MARK: - Localized tax receipt presentation

extension Asso {

    /// Returns a human-readable string describing tax receipt eligibility for the current user.
    /// Handles 0 / 1 / many countries and singular/plural string variants.
    public func taxReceiptCountriesPresentation() -> String {
        guard let name = name else { return "" }
        switch arrayCountryTaxDeductible?.count {
        case nil, 0:
            return Strings.deliversReceiptNone(assoName: name)
        case 1:
            return singleTaxReceiptPresentation(name: name)
        default:
            return multipleTaxReceiptPresentation(name: name)
        }
    }

    private func singleTaxReceiptPresentation(name: String) -> String {
        deliversTaxReceiptForCurrentUser()
            ? Strings.deliversReceiptSing(assoName: name, countries: taxReceiptCountriesStr())
            : Strings.deliversReceiptOnlySing(assoName: name, countries: taxReceiptCountriesStr())
    }

    private func multipleTaxReceiptPresentation(name: String) -> String {
        deliversTaxReceiptForCurrentUser()
            ? Strings.deliversReceiptPlur(assoName: name, countries: taxReceiptCountriesStr())
            : Strings.deliversReceiptOnlyPlur(assoName: name, countries: taxReceiptCountriesStr())
    }

    private func taxReceiptCountriesStr() -> String {
        guard let countries = arrayCountryTaxDeductible else { return "" }
        return countries.enumerated().map { (i, country) in
            let punct = i == countries.count - 1 ? ".\u{200F}" : ", " // U+200F: RTL mark for Hebrew
            return country.fullName() + punct
        }.joined()
    }

}

// MARK: - [Asso] helpers

extension Array where Element == Asso {

    func convertToName() -> [String] { compactMap(\.name) }
    func convertToId()   -> [String] { filter(\.hasId).map(\.id) }

    func allHaveName() -> Bool { allSatisfy(\.hasName) }
    func containsOneWithNoName() -> Bool { contains(where: \.hasEmptyName) }

    /// In-place replace: find the asso with the same id and swap its data.
    mutating func replaceWithAssoData(_ asso: Asso) {
        guard let index = findIndex(assoId: asso.id) else { return }
        self[index] = asso
    }

    func findIndex(assoId: String) -> Int? {
        firstIndex(where: { $0.id == assoId })
    }

    func keepOnly(idsArray: [String]) -> [Asso] {
        filter { idsArray.contains($0.id) }
    }

    func toSystemJSON() -> [[String: [String]]] {
        map { $0.toSystemJSON() }
    }

}

// MARK: - Serialization (system JSON ↔ struct)
//
// "System JSON" is how Asso arrays are persisted locally (UserDefaults via SystemDataSource).
// Keys are static constants on Asso to keep them colocated with the type.

extension Asso {

    static let SYSTEM_KEY_ASSO_NAME           = "KeyForAssoName"
    static let SYSTEM_KEY_ASSO_NAME_LANGAGE   = "KeyForAssoNameLangage"
    static let SYSTEM_KEY_ASSO_ID             = "KeyForAssoId"
    static let SYSTEM_KEY_ASSO_MAIN_CATEGO    = "KeyForAssoMainCatego"
    static let SYSTEM_KEY_ASSO_SUB_CATEGO     = "KeyForAssoSubCatego"
    static let SYSTEM_KEY_ASSO_ADDRESS        = "KeyForAssoAddress"
    static let SYSTEM_KEY_ASSO_WEBSITE        = "KeyForAssoWebsite"
    static let SYSTEM_KEY_ASSO_DESCRIPTION    = "KeyForAssoDesc"
    static let SYSTEM_KEY_ASSO_ARRAY_TAX      = "KeyForAssoArray"
    static let SYSTEM_KEY_ASSO_STRIPE_ACCOUNTS = "KeyForAssoStripeAccounts"

    func toSystemJSON() -> [String: [String]] {
        [
            Asso.SYSTEM_KEY_ASSO_NAME:            [name ?? ""],
            Asso.SYSTEM_KEY_ASSO_NAME_LANGAGE:    [nameLangage ?? ""],
            Asso.SYSTEM_KEY_ASSO_ID:              [id],
            Asso.SYSTEM_KEY_ASSO_MAIN_CATEGO:     [mainCatego ?? ""],
            Asso.SYSTEM_KEY_ASSO_SUB_CATEGO:      [subCatego ?? ""],
            Asso.SYSTEM_KEY_ASSO_ADDRESS:         [address ?? ""],
            Asso.SYSTEM_KEY_ASSO_WEBSITE:         [website ?? ""],
            Asso.SYSTEM_KEY_ASSO_DESCRIPTION:     [desc ?? ""],
            Asso.SYSTEM_KEY_ASSO_ARRAY_TAX:       arrayCountryTaxDeductible?.convertToString() ?? [],
            Asso.SYSTEM_KEY_ASSO_STRIPE_ACCOUNTS: stripeAccounts?.map { $0.toSystemString() } ?? [],
        ]
    }

}

extension Dictionary where Key == String, Value == [String?] {

    func toAsso() -> Asso {
        guard self[Asso.SYSTEM_KEY_ASSO_ARRAY_TAX] != nil else { return Asso() }

        let taxArray      = self[Asso.SYSTEM_KEY_ASSO_ARRAY_TAX]!.toUnwrappedArray()
        let stripeStrings = self[Asso.SYSTEM_KEY_ASSO_STRIPE_ACCOUNTS]?.toUnwrappedArray() ?? []
        let stripeAccounts = stripeStrings.compactMap { StripeAccount.fromSystemString($0) }

        return Asso(
            id:                        self[Asso.SYSTEM_KEY_ASSO_ID]?[0],
            name:                      self[Asso.SYSTEM_KEY_ASSO_NAME]?[0],
            nameLangage:               self[Asso.SYSTEM_KEY_ASSO_NAME_LANGAGE]?[0],
            mainCatego:                self[Asso.SYSTEM_KEY_ASSO_MAIN_CATEGO]?[0],
            subCatego:                 self[Asso.SYSTEM_KEY_ASSO_SUB_CATEGO]?[0],
            address:                   self[Asso.SYSTEM_KEY_ASSO_ADDRESS]?[0],
            website:                   self[Asso.SYSTEM_KEY_ASSO_WEBSITE]?[0],
            desc:                      self[Asso.SYSTEM_KEY_ASSO_DESCRIPTION]?[0],
            arrayCountryTaxDeductible: taxArray.convertToTaxReceiptCountry(),
            stripeAccounts:            stripeAccounts
        )
    }

}

extension Array where Element == [String: [String?]] {
    func toAsso() -> [Asso] { map { $0.toAsso() } }
}

extension Array where Element == String? {
    func toUnwrappedArray() -> [String] { compactMap { $0 } }
}
