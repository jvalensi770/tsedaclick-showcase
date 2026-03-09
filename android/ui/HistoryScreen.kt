// MARK: - UI Layer — HistoryScreen
//
// Compose screen for the donation history tab.
// Shows a unified list of: unpaid promises, pending payments, and past payments.
//
// Design choices:
//  - `HistoryScreen` is a top-level @Composable that dispatches to a sealed-class
//    variant (HistView.General vs HistView.Details). The sealed class carries the
//    correct data for each variant; the Composable tree is the same for both.
//  - `HistView` is a sealed class (not an enum or simple if/else) so each variant
//    can carry different data shapes without nulls or Union types.
//  - `History.ListView` and `List<Promise>.ListView` are @Composable extension
//    functions: they read as "render this domain object as a list" at the call site,
//    which is idiomatic Kotlin without requiring a wrapping composable class.
//  - LazyColumn + itemsIndexed: standard Compose lazy list, avoids instantiating
//    item views for off-screen rows.
//  - The back arrow renders the language-appropriate icon (`preferredLangage.backArrowImage`)
//    so RTL languages (Hebrew) get the correct direction automatically.

package com.kikarov.tsedaclick.views

import android.annotation.SuppressLint
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.Divider
import androidx.compose.material.Icon
import androidx.compose.material.IconButton
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.unit.dp
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.kikarov.tsedaclick.R
import com.kikarov.tsedaclick.activities.fragments.Frag3_History
import com.kikarov.tsedaclick.activities.fragments.Frag3_HistoryDetails
import com.kikarov.tsedaclick.activities.fragments.Frag3_HistoryDetailsDirections
import com.kikarov.tsedaclick.data_model.CurrentUser
import com.kikarov.tsedaclick.ds_locale.preferredLangage
import com.kikarov.tsedaclick.objects.History
import com.kikarov.tsedaclick.objects.Promise
import com.kikarov.tsedaclick.objects.dateSorted
import com.kikarov.tsedaclick.presentation.RobotoTypography

// MARK: - Entry point

/**
 * Dispatches to the correct HistView variant based on the Fragment type.
 * Adding a new history view variant = adding a sealed class subtype + a `when` arm here.
 */
@Composable
fun HistoryScreen(
    parentFrag: Fragment,
    top_title: String = "",
    history: History? = null,
    corrPromise: List<Promise> = emptyList()
) {
    when (parentFrag) {
        is Frag3_History        -> HistView.General(parentFrag, history).HistView()
        is Frag3_HistoryDetails -> HistView.Details(parentFrag, top_title, corrPromise).HistView()
        else                    -> {}
    }
}

// MARK: - Sealed class — one variant per screen context

sealed class HistView(val parentFrag: Fragment) {

    class General(
        parentFrag: Fragment,
        override var history: History?
    ) : HistView(parentFrag) {
        override val top_title: String
            get() = parentFrag.getString(R.string.bottom_bar_icon3)
        override var corrPromise: List<Promise>? = null
    }

    class Details(
        parentFrag: Fragment,
        override val top_title: String,
        override var corrPromise: List<Promise>?
    ) : HistView(parentFrag) {
        override var history: History? = null
    }

    abstract val top_title: String
    abstract var history: History?
    abstract var corrPromise: List<Promise>?

    @SuppressLint("NotConstructor")
    @Composable
    fun HistView() {
        Column(modifier = Modifier.fillMaxSize()) {

            // Header row: back arrow (Details only) + title
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colorResource(R.color.White)),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (parentFrag is Frag3_HistoryDetails) {
                    IconButton(
                        modifier = Modifier.padding(end = 5.dp),
                        onClick  = {
                            parentFrag.findNavController().navigate(
                                Frag3_HistoryDetailsDirections.actionBottomBarIcon3DetailsToBottomBarIcon3()
                            )
                        }
                    ) {
                        Icon(
                            // preferredLangage.backArrowImage returns ← for LTR, → for RTL (Hebrew)
                            imageVector = preferredLangage.backArrowImage,
                            contentDescription = "Back",
                            tint = androidx.compose.ui.graphics.Color.Black
                        )
                    }
                    Text(text = top_title, style = RobotoTypography.h1,
                        modifier = Modifier.padding(vertical = 20.dp))
                } else {
                    Text(text = top_title, style = RobotoTypography.h1,
                        modifier = Modifier.padding(top = 20.dp, bottom = 20.dp, start = 20.dp))
                }
            }

            // Thin separator line
            Box(modifier = Modifier.fillMaxWidth().height(2.dp)
                .background(colorResource(R.color.light_gray)))

            // Content: general history or payment-detail promise list
            history?.ListView(parentFrag)
            corrPromise?.ListView()
        }
    }
}

// MARK: - @Composable extension functions on domain objects

/**
 * Renders a [History] as a LazyColumn.
 * Builds the heterogeneous item list (unpaid promises, pendings, payments)
 * then delegates each item's rendering to its own [CardViewItem] composable.
 */
@Composable
fun History.ListView(parentFrag: Fragment) {
    val items = buildHistoryItems(parentFrag)
    LazyColumn(modifier = Modifier.fillMaxWidth()) {
        itemsIndexed(items) { _, item ->
            item.CardViewItem(parentFrag)
            if (item !is HistoryViewListItem.PaymentHeaderItem) {
                Divider(color = colorResource(R.color.thin_gray), thickness = 1.dp)
            }
        }
    }
}

private fun History.buildHistoryItems(parentFrag: Fragment): ArrayList<HistoryViewListItem> {
    val result = arrayListOf<HistoryViewListItem>()
    if (promisesToPay.total() != 0.0) {
        result.add(
            if (CurrentUser.lastPaymentFailed()) HistoryViewListItem.PromisesFailedItem(promisesToPay)
            else HistoryViewListItem.PromisesToPayItem(promisesToPay)
        )
    }
    for (pending in pendings.dateSorted()) { result.add(HistoryViewListItem.PendingItem(parentFrag, pending)) }
    result.addAll(paymentsViewItem())
    return result
}

/**
 * Renders a list of [Promise] objects (payment detail view) as a LazyColumn,
 * sorted by date descending.
 */
@Composable
fun List<out Promise>.ListView() {
    LazyColumn(modifier = Modifier.fillMaxWidth()) {
        itemsIndexed(sortedByDescending { it.date }) { _, promise ->
            promise.CardViewItem()
            Divider(color = colorResource(R.color.thin_gray), thickness = 1.dp)
        }
    }
}
