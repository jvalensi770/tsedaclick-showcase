// MARK: - ViewModel — MainVM
//
// MainVM holds the state for the main donation screen:
//   - which asso is selected
//   - the current donation amount
//   - which coin/bill visual to display
//
// Design choices:
//  - Static properties: the main screen is a singleton experience (one active
//    session at a time). Static state avoids passing the VM through a chain
//    of child views and matches UIKit's non-SwiftUI architecture here.
//  - Property observers (didSet): mutating assoSelected or donationAmount
//    automatically notifies all interested observers via NSNotification,
//    without any explicit binding mechanism.
//  - Logic is kept in the VM: `tsedaViewToDisplay` and `currentSessionToPromise`
//    are pure(-ish) functions that the VC calls to update its UI. The VC never
//    reads state directly from the model layer.

import Foundation
import UIKit

class MainVM {

    // MARK: - Observed state

    static var assoSelected: Asso = Asso() {
        didSet {
            // Push to front of favo list unless it's already there
            if !assoSelected.isInAssoSegMainVC() {
                CurrentUser.pushAsFirstAssoFavo(assoSelected)
            }
            InAppNotif.sendNotif(name: InAppNotif.MAIN_ASSO_SELECTED_CHANGED)
        }
    }

    static var donationAmount: Double = 0 {
        didSet {
            if donationAmount > INFINITY_MINUS_ONE { donationAmount = INFINITY_MINUS_ONE }
            InAppNotif.sendNotif(name: InAppNotif.MAIN_DONATE_AMOUNT_CHANGED)
        }
    }

    // Amount thresholds for switching between coin/bill visuals
    static let MAX_AMOUNT_FOR_VIEW1 = 0.30
    static let MAX_AMOUNT_FOR_VIEW2 = 2.00
    static let MAX_AMOUNT_FOR_VIEW3 = 4.00

    static var makeNoise: Bool {
        get { SystemDataSource.retriever.makeCoinsNoise() }
        set { SystemDataSource.setter.setMakeCoinsNoise(newValue) }
    }

    init() { observeNotifs_MainVM() }

    static func reset() {
        assoSelected   = Asso()
        donationAmount = 0
    }

}

// MARK: - Asso selection

extension MainVM {

    /// Selects the asso at the given index in the user's favo list.
    /// No-ops if the index is out of bounds.
    public static func selectAssoFavo(index: Int) {
        guard let asso = CurrentUser.getInstance().assoFavoArray?.getSafely(index) else { return }
        MainVM.assoSelected = asso
    }

    public static func selectLastIndexInAssoFavoSeg() {
        selectAssoFavo(index: CurrentUser.getInstance().lastIndexSelectedInAssoFavoSeg)
    }

}

// MARK: - Amount display

extension MainVM {

    /// Returns the coin/bill image corresponding to the current donation amount.
    /// Iterates the currency-specific visual thresholds until the amount is exceeded.
    public static func tsedaViewToDisplay(_ amount: Double = MainVM.donationAmount) -> UIImage {
        let views = CurrentUser.getInstance().currency.tsedaViewsArray()
        if amount > INFINITY { return views.last!.image }

        var tsedaView = UIImage(named: "tseda_view_all_level0.png")
        var lowerBound = 0.0
        var i = 0
        while amount.roundTo2Decimals() > lowerBound {
            tsedaView   = views[i].image
            lowerBound  = views[i].maxAmountIncluded
            i += 1
        }
        return tsedaView!
    }

    /// Formats the amount for display in the text field. Returns "" for zero.
    public static func amountTextField() -> String {
        guard String(format: "%.2f", donationAmount) != "0.00" else { return "" }
        return String(format: "%.2f", donationAmount)
    }

}

// MARK: - Coin tap interactions

extension MainVM {

    public static func increaseDonationAmount(_ amount: Double) {
        MainVM.donationAmount += amount
    }

    public static func switchNoise() {
        makeNoise = !makeNoise
    }

}

// MARK: - Build a Promise from the current session

extension MainVM {

    /// Returns a Promise if both an asso is selected and an amount is set,
    /// otherwise nil. Called by the VC just before triggering payment.
    public static func currentSessionToPromise() -> Promise? {
        guard !assoSelected.hasEmptyId(), donationAmount != 0 else { return nil }
        return Promise(
            amount: donationAmount,
            asso:   assoSelected,
            date:   Date(),
            type:   .MANUAL
        )
    }

}

// MARK: - NSNotification listeners

extension MainVM {

    /// Reset amount when currency changes — previous amount is no longer meaningful.
    @objc func onCurrentUserCurrencyChange() {
        MainVM.donationAmount = 0
    }

}

// MARK: - Asso extension (MainVC context)

extension Asso {

    /// True if this asso is already in the first N slots of the favo segment in MainVC.
    func isInAssoSegMainVC() -> Bool {
        CurrentUser.getInstance().assoFavoArray?.containsInTheFirstPos(
            element: self,
            maxPosIncluded: MainVC.NBR_ASSO_FAVO_IN_SEG - 1
        ) ?? false
    }

}
