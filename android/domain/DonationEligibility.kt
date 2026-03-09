// MARK: - Domain Layer — DonationEligibility
//
// Pure domain logic that decides whether a donation can proceed immediately or
// requires the user to register a credit card first.
//
// Design choices:
//  - Sealed class result type: the two outcomes are structurally distinct.
//    `Ready` carries no payload; `RequireCard` carries a `Message` that controls
//    which dialog the UI shows. The caller exhausts both cases with `when`.
//  - Service as an `object`: stateless, no dependencies, fully testable.
//    No Android framework imports — this file could live in a pure Kotlin module.
//  - Private extension functions on User/Asso: the eligibility predicates read
//    naturally (hasStripeAccount, hasTsedaclickPaymentMethod…) without polluting
//    the public API of those classes.

package com.kikarov.tsedaclick.objects

import com.kikarov.tsedaclick.data_model.CurrentUser
import com.kikarov.tsedaclick.stripe.StripeIdWithOwner

// MARK: - Result type

sealed class DonationEligibilityResult {

    /** The donation can be processed immediately — no card prompt needed. */
    object Ready : DonationEligibilityResult()

    /**
     * The user must register a card before donating.
     * [message] controls the UX: NONE = first-time user (no need to reassure),
     * REASSURE = returning user who already gave (show a reassuring message).
     */
    data class RequireCard(val message: Message) : DonationEligibilityResult() {
        enum class Message { NONE, REASSURE }
    }
}

// MARK: - Eligibility service

object DonationEligibilityService {

    /**
     * Evaluates whether the user can donate [amount] to [asso] right now.
     *
     * Rules (in order):
     *  1. Asso has no Stripe account → any Tsedaclick-level card is sufficient.
     *  2. Asso has a Stripe account + high amount → needs a card scoped to that asso.
     *  3. Asso has a Stripe account + low amount → Tsedaclick-level card is enough.
     *  4. Otherwise → prompt for card registration.
     */
    fun evaluateEligibility(asso: Asso?, amount: Double?): DonationEligibilityResult {
        val hasStripe            = asso?.hasStripeAccount() == true
        val hasCardForAsso       = CurrentUser.hasPaymentMethodToPay(asso)
        val hasCardForTsedaclick = CurrentUser.hasTsedaclickPaymentMethod()
        val hasAnyCard           = CurrentUser.hasAnyPaymentMethod()
        val isHighAmount         = (amount ?: 0.0) >= CurrentUser.currency.minAmountRequiringNewCbSave

        // Cases where the donation can proceed directly:
        if (!hasStripe && hasCardForTsedaclick)             return DonationEligibilityResult.Ready
        if (hasStripe && isHighAmount  && hasCardForAsso)   return DonationEligibilityResult.Ready
        if (hasStripe && !isHighAmount && hasCardForTsedaclick) return DonationEligibilityResult.Ready

        // Card required — choose the right reassurance message:
        val message = if (hasAnyCard)
            DonationEligibilityResult.RequireCard.Message.REASSURE
        else
            DonationEligibilityResult.RequireCard.Message.NONE

        return DonationEligibilityResult.RequireCard(message)
    }
}

// MARK: - Private predicates (keep the service readable)

private fun Asso.hasStripeAccount() = stripeAccounts.isNotEmpty()

private fun User.hasPaymentMethodToPay(asso: Asso?) =
    stripeAccountsWithPM.any { it is StripeIdWithOwner.Asso && it.owner == asso?.id }

private fun User.hasTsedaclickPaymentMethod() =
    stripeAccountsWithPM.any { it is StripeIdWithOwner.Tseda }

fun User.hasAnyPaymentMethod() = stripeAccountsWithPM.isNotEmpty()
