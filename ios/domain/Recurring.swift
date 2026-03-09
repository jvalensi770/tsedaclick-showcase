// MARK: - Domain Layer — Recurring
//
// A Recurring represents a scheduled recurring donation from a user to an asso.
//
// Design choices:
//  - Value type (struct) — immutable snapshots passed between layers.
//  - Equatable: full field-by-field comparison (not just id) so the edit form can
//    detect unsaved changes and show/hide the Save button.
//  - `isDisplayedTheSameInEditFormVc` is a separate, named predicate instead of
//    overloading `==` — it captures a different semantic (UI equivalence vs. identity).
//  - Anchor encoding: for DAILY recurrings, time-of-day is encoded as quarters of
//    an hour (0 = 00:00, 1 = 00:15 … 95 = 23:45). This makes sorting trivial
//    and avoids dealing with Dates for what is essentially a time slot index.

import Foundation
import SwiftUI

let RECURRING_DEFAULT_VALUE_ID          = ""
let RECURRING_DEFAULT_VALUE_ASSO        = Asso()
let RECURRING_DEFAULT_VALUE_AMOUNT      = Double(0)
let RECURRING_DEFAULT_VALUE_ANCHOR      = 0
let RECURRING_DEFAULT_VALUE_FREQ        = RecurringFreq.DEFAULT()
let RECURRING_DEFAULT_VALUE_TYPE        = RecurringType.DEFAULT()
let RECURRING_DEFAULT_VALUE_EMAIL       = "NONE"
let RECURRING_DEFAULT_VALUE_PHONE       = PhoneNumber()
let RECURRING_DEFAULT_VALUE_CHANNEL     = RecurringChannel.NONE
let RECURRING_DEFAULT_VALUE_IS_ACTIVE   = true

let MINIMUM_RECURRINGS_PER_USER = 2

public struct Recurring {

    var id:             String
    var asso:           Asso
    var amount:         Double
    var anchor:         Int              // quarter-hour index (DAILY) or weekday/day-of-month
    var freq:           RecurringFreq
    var type:           RecurringType
    var email:          String
    var phoneNumber:    PhoneNumber
    var clickChannel:   RecurringChannel
    var confirmChannel: RecurringChannel
    var isActive:       Bool

    internal init(
        id:             String          = RECURRING_DEFAULT_VALUE_ID,
        asso:           Asso            = RECURRING_DEFAULT_VALUE_ASSO,
        amount:         Double          = RECURRING_DEFAULT_VALUE_AMOUNT,
        anchor:         Int             = RECURRING_DEFAULT_VALUE_ANCHOR,
        freq:           RecurringFreq   = RECURRING_DEFAULT_VALUE_FREQ,
        type:           RecurringType   = RECURRING_DEFAULT_VALUE_TYPE,
        email:          String          = RECURRING_DEFAULT_VALUE_EMAIL,
        phoneNumber:    PhoneNumber     = RECURRING_DEFAULT_VALUE_PHONE,
        clickChannel:   RecurringChannel = RECURRING_DEFAULT_VALUE_CHANNEL,
        confirmChannel: RecurringChannel = RECURRING_DEFAULT_VALUE_CHANNEL,
        isActive:       Bool            = RECURRING_DEFAULT_VALUE_IS_ACTIVE
    ) {
        self.id             = id
        self.asso           = asso
        self.amount         = amount
        self.anchor         = anchor
        self.freq           = freq
        self.type           = type
        self.email          = email
        self.phoneNumber    = phoneNumber
        self.clickChannel   = clickChannel
        self.confirmChannel = confirmChannel
        self.isActive       = isActive
    }

    func hasPhoneNumber() -> Bool { phoneNumber != PhoneNumber() }

}

// MARK: - Equatable — full comparison for change detection

extension Recurring: Equatable {

    public static func == (lhs: Recurring, rhs: Recurring) -> Bool {
        lhs.id             == rhs.id             &&
        lhs.amount         == rhs.amount         &&
        lhs.asso           == rhs.asso           &&
        lhs.anchor         == rhs.anchor         &&
        lhs.freq           == rhs.freq           &&
        lhs.type           == rhs.type           &&
        lhs.email          == rhs.email          &&
        lhs.phoneNumber    == rhs.phoneNumber    &&
        lhs.clickChannel   == rhs.clickChannel   &&
        lhs.confirmChannel == rhs.confirmChannel &&
        lhs.isActive       == rhs.isActive
    }

    /// True if the two recurrings would render identically in the edit form —
    /// used to show/hide the Save button without re-implementing == semantics.
    public func isDisplayedTheSameInEditFormVc(recurring: Recurring) -> Bool {
        freq        == recurring.freq        &&
        anchor      == recurring.anchor      &&
        amount      == recurring.amount      &&
        asso        == recurring.asso        &&
        type        == recurring.type        &&
        phoneNumber.format_national == recurring.phoneNumber.format_national
    }

    public func doesNotGiveTheSameEditFormVc(recurring: Recurring) -> Bool {
        !isDisplayedTheSameInEditFormVc(recurring: recurring)
    }

}

// MARK: - Anchor: DAILY time encoding
//
// For DAILY recurrings, `anchor` encodes time-of-day as a quarter-hour index:
//   anchor = hour * 4 + (minute / 15)
//   Range: 0 (00:00) … 95 (23:45)
//
// This makes sorting and arithmetic trivial compared to storing a full Date or
// two separate Int fields (hour, minute).

enum AnchorError: Error { case wrongFrequency }

extension Recurring {

    func dailyAnchorStr_24H() throws -> String {
        guard freq == .DAILY && anchor < 96 else { throw AnchorError.wrongFrequency }
        return "\(hourInt_24H().twoDigits()):\(minuteInt().twoDigits())"
    }

    func dailyAnchorStr_12H() throws -> String {
        guard freq == .DAILY && anchor < 96 else { throw AnchorError.wrongFrequency }
        return "\(hourInt_12H().twoDigits()):\(minuteInt().twoDigits())\(AMPM())"
    }

    func hourInt_24H() -> Int { dailyTime().hour }
    func hourInt_12H() -> Int { let h = hourInt_24H(); return h >= 12 ? h - 12 : h }
    func minuteInt()   -> Int { dailyTime().minute }
    func AMPM()        -> String { anchor < 48 ? "AM" : "PM" }

    private func dailyTime() -> (hour: Int, minute: Int) {
        guard freq == .DAILY && anchor < 96 else { return (24, 60) }
        let (hour, quarter) = anchor.quotientAndRemainder(dividingBy: 4)
        return (hour, quarter.quarterToMinutes())
    }

    static func dailyAnchor(hour: Int, min: Int) -> Int {
        hour * 4 + min.quotientAndRemainder(dividingBy: 15).quotient
    }

}

private extension Int {
    func quarterToMinutes() -> Int {
        switch self { case 1: return 15; case 2: return 30; case 3: return 45; default: return 0 }
    }
}

// MARK: - [Recurring] helpers

extension Array where Element == Recurring {

    func containsOneRecurring(ofFreq freq: RecurringFreq) -> Bool {
        contains(where: { $0.freq == freq })
    }

    func donationsNbr(ofFreq freq: RecurringFreq) -> Int {
        filter { $0.freq == freq }.count
    }

    func array(ofFreq freq: RecurringFreq) -> [Recurring] {
        filter { $0.freq == freq }
    }

    func noneHasDonation() -> Bool {
        allSatisfy { $0.amount == 0 }
    }

    mutating func sortByDate() {
        sort(by: { $0.anchor < $1.anchor })
    }

}

// MARK: - RecurringFreq

enum RecurringFreq: String {

    case DAILY, WEEKLY, MONTHLY

    static func DEFAULT() -> RecurringFreq { .DAILY }

    func editVC_SegmentPos() -> Int {
        switch self { case .DAILY: return 0; case .WEEKLY: return 1; case .MONTHLY: return 2 }
    }

    func headerSectionTitle() -> String {
        switch self {
        case .DAILY:   return Strings.daily()
        case .WEEKLY:  return Strings.weeklyShort()
        case .MONTHLY: return Strings.monthly()
        }
    }

    func amountsInEditVcSeg(currency: Currency = CurrentUser.getInstance().currency) -> [Double] {
        switch self {
        case .DAILY:   return currency.dailyRecurringSuggestedAmounts()
        case .WEEKLY:  return currency.weeklyRecurringSuggestedAmounts()
        case .MONTHLY: return currency.monthlyRecurringSuggestedAmounts()
        }
    }

}

extension Int {
    func recFreq() -> RecurringFreq {
        switch self { case 0: return .DAILY; case 1: return .WEEKLY; case 2: return .MONTHLY; default: return .DEFAULT() }
    }
}

// MARK: - RecurringType

enum RecurringType: String {

    case CLICK_REQUIRED  // User must tap the WhatsApp message to confirm each donation
    case AUTO            // Donation is triggered automatically at the scheduled time

    static func DEFAULT() -> RecurringType { .CLICK_REQUIRED }

    func editVC_LeftPhoneNumberLabel() -> String {
        switch self {
        case .CLICK_REQUIRED: return Strings.editVcWhatsAppNumberLabelClickRequired()
        case .AUTO:           return Strings.editVcWhatsAppNumberLabelAuto()
        }
    }

}

// MARK: - RecurringChannel

enum RecurringChannel: String {
    case NONE
    case WHATSAPP

    static func DEFAULT() -> RecurringChannel { .NONE }
}
