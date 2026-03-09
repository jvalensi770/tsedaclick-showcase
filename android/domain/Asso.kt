// MARK: - Domain Layer — Asso
//
// Asso is the central aggregate of the donor-facing Android app.
//
// Design choices:
//  - Regular class (not data class): equality is id-only, so we override equals/hashCode
//    manually rather than exposing structural equality everywhere.
//  - Firestore field names as top-level constants: same refactoring-safety pattern as the
//    TypeScript backend — changing a Firestore key means changing one constant.
//  - Multilingual name resolution: assoName() and assoAddress() check the user's preferred
//    language first, fall back to the default language, then fall back to the legacy
//    scalar field. This makes the migration from scalar → i18n map transparent to callers.
//  - Extension functions for presentation and serialization are in the same file but
//    outside the class, keeping the class itself minimal.

package com.kikarov.tsedaclick.objects

import com.google.firebase.firestore.DocumentSnapshot
import com.kikarov.tsedaclick.Tsedaclick
import com.kikarov.tsedaclick.data_model.CurrentUser
import com.kikarov.tsedaclick.ds_locale.DEFAULT_LANGUAGE
import com.kikarov.tsedaclick.ds_locale.preferredLangage
import com.kikarov.tsedaclick.R.string.*
import com.kikarov.tsedaclick.stripe.StripeIdWithOwner

// MARK: - Firestore field name constants
// Same pattern as the TypeScript backend: one constant per Firestore key.

const val ASSO_KEY_ASSO_ID       = "AssoId"
const val ASSO_KEY_ASSO_NAME     = "AssoName"
const val ASSO_KEY_ASSO_NAME_MAP = "AssoNameMap"
const val ASSO_KEY_ASSO_ADDRESS  = "Address"
const val ASSO_KEY_ASSO_ADDRESS_MAP = "AddressMap"
const val ASSO_KEY_WEBSITE       = "WebSite"
const val ASSO_KEY_MAIN_CATEGO   = "MainCatego"
const val ASSO_KEY_SUB_CATEGO    = "SubCatego"
const val ASSO_KEY_TAX_ARRAY     = "TaxDeductibleIn"

// MARK: - Aggregate

class Asso(
    val id: String = "",
    val name: String = "",
    val nameLangage: String = "",
    val mainCatego: String = "",
    val subCatego: String = "",
    val address: String = "",
    val website: String = "",
    val arrayCountryTaxDeductible: ArrayList<TaxReceiptCountry> = ArrayList(),
    var stripeAccounts: List<StripeIdWithOwner> = emptyList()
) {

    // Equality is id-only — two Asso objects are the same association regardless
    // of which fields were fetched or in what language.
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false
        other as Asso
        return id == other.id
    }

    override fun hashCode() = id.hashCode()

    fun deliversTaxReceiptIn(country: TaxReceiptCountry) =
        arrayCountryTaxDeductible.contains(country)

    fun deliversTaxReceiptForCurrentUser() =
        deliversTaxReceiptIn(CurrentUser.taxReceiptCountry)

    fun isTaxCountryKnown() = CurrentUser.assosIdTaxCountryKnown.contains(id.knownSuffixed())

    fun isNotAnEmptyAsso() = name.isNotEmpty() && id.isNotEmpty()

    companion object {

        // MARK: - Factory (from Firestore map)

        fun fromMap(assoMap: MutableMap<String, Any>?) = extractProps(assoMap)

        fun fromMapWithStripeAccounts(
            assoMap: MutableMap<String, Any>?,
            stripeAccounts: List<MutableMap<String, Any?>>
        ) = extractProps(assoMap, StripeIdWithOwner.listFromRaw(stripeAccounts))

        private fun extractProps(
            assoMap: MutableMap<String, Any>?,
            stripeAccounts: List<StripeIdWithOwner> = emptyList()
        ) = Asso(
            id                        = assoMap?.get(ASSO_KEY_ASSO_ID) as? String ?: "",
            name                      = assoName(assoMap),
            nameLangage               = assoNameLangage(assoMap).toString(),
            mainCatego                = assoMap.mainCatego(),
            subCatego                 = assoMap.subCatego(),
            address                   = assoAddress(assoMap),
            website                   = assoMap?.get(ASSO_KEY_WEBSITE) as? String ?: "",
            arrayCountryTaxDeductible = (assoMap?.get(ASSO_KEY_TAX_ARRAY) as? ArrayList<String>)
                .toTaxReceiptCountryArray(),
            stripeAccounts            = stripeAccounts
        )

        // Multilingual resolution: preferred language → default language → legacy scalar field.
        fun assoName(assoMap: MutableMap<String, Any>?): String =
            (assoMap?.get(ASSO_KEY_ASSO_NAME_MAP) as? HashMap<*, String>)
                ?.get(preferredLangage.toString())
                ?: (assoMap?.get(ASSO_KEY_ASSO_NAME_MAP) as? HashMap<*, String>)
                    ?.get(DEFAULT_LANGUAGE.toString())
                ?: assoMap?.get(ASSO_KEY_ASSO_NAME) as? String
                ?: ""

        fun assoNameLangage(assoMap: MutableMap<String, Any>?) =
            if (assoName(assoMap) == (assoMap?.get(ASSO_KEY_ASSO_NAME_MAP)
                    as? HashMap<*, String>)?.get(preferredLangage.toString())) {
                preferredLangage
            } else { DEFAULT_LANGUAGE }

        fun assoAddress(assoMap: MutableMap<String, Any>?) =
            (assoMap?.get(ASSO_KEY_ASSO_ADDRESS_MAP) as? HashMap<*, String>)
                ?.get(preferredLangage.toString())
                ?: (assoMap?.get(ASSO_KEY_ASSO_ADDRESS_MAP) as? HashMap<*, String>)
                    ?.get(DEFAULT_LANGUAGE.toString())
                ?: assoMap?.get(ASSO_KEY_ASSO_ADDRESS) as? String
                ?: ""
    }
}

// MARK: - i18n field helpers (used on DocumentSnapshot and raw maps)
// Applying the same multilingual resolution from Firestore reads.

@Suppress("UNCHECKED_CAST")
fun MutableMap<String, Any>?.systemOrDefaultField(field: String): String {
    val map = this?.get(field) as? HashMap<String, String>
    return map?.get(preferredLangage.toString()) ?: map?.get(DEFAULT_LANGUAGE.toString()) ?: ""
}
fun MutableMap<String, Any>?.mainCatego() = systemOrDefaultField(ASSO_KEY_MAIN_CATEGO)
fun MutableMap<String, Any>?.subCatego()  = systemOrDefaultField(ASSO_KEY_SUB_CATEGO)

@Suppress("UNCHECKED_CAST")
fun DocumentSnapshot.systemOrDefaultField(field: String): String {
    val map = get(field) as? HashMap<String, String>
    return map?.get(preferredLangage.toString()) ?: map?.get(DEFAULT_LANGUAGE.toString()) ?: ""
}
fun DocumentSnapshot.mainCatego() = systemOrDefaultField(ASSO_KEY_MAIN_CATEGO)
fun DocumentSnapshot.subCatego()  = systemOrDefaultField(ASSO_KEY_SUB_CATEGO)

// MARK: - Tax receipt presentation

fun Asso.taxReceiptCountriesPresentation(): String {

    fun taxReceiptCountriesStr(): String {
        val sb = StringBuilder()
        for ((i, country) in arrayCountryTaxDeductible.withIndex()) {
            val punct = if (i == arrayCountryTaxDeductible.lastIndex) "." else ", "
            sb.append(country.countryName()).append(punct)
        }
        return sb.toString()
    }

    fun single() = if (deliversTaxReceiptForCurrentUser()) {
        Tsedaclick.instance.getString(delivers_receipt_sing, name, taxReceiptCountriesStr())
    } else {
        Tsedaclick.instance.getString(delivers_receipt_sing_only, name, taxReceiptCountriesStr())
    }

    fun multiple() = if (deliversTaxReceiptForCurrentUser()) {
        Tsedaclick.instance.getString(delivers_receipt_plur, name, taxReceiptCountriesStr())
    } else {
        Tsedaclick.instance.getString(delivers_receipt_plur_only, name, taxReceiptCountriesStr())
    }

    return when (arrayCountryTaxDeductible.size) {
        0    -> Tsedaclick.instance.getString(delivers_receipt_none, name)
        1    -> single()
        else -> multiple()
    }
}

// MARK: - Local persistence serialization
// Keys for SharedPreferences storage (separate from Firestore keys above).

private const val SYSTEM_MAP_ASSO_NAME      = "AssoName"
private const val SYSTEM_MAP_ASSO_ID        = "AssoId"
private const val SYSTEM_MAP_ASSO_ADDRESS   = "Address"
private const val SYSTEM_MAP_ASSO_WEBSITE   = "WebSite"
private const val SYSTEM_MAP_ASSO_TAX_ARRAY = "AssoTaxArray"
private const val SYSTEM_MAP_ASSO_NAME_LANGAGE = "AssoNameLangage"

fun Asso.toSystemDataMap() = mapOf(
    SYSTEM_MAP_ASSO_NAME         to arrayListOf(name),
    SYSTEM_MAP_ASSO_NAME_LANGAGE to arrayListOf(nameLangage),
    SYSTEM_MAP_ASSO_ID           to arrayListOf(id),
    SYSTEM_MAP_ASSO_ADDRESS      to arrayListOf(address),
    SYSTEM_MAP_ASSO_WEBSITE      to arrayListOf(website),
    SYSTEM_MAP_ASSO_TAX_ARRAY    to arrayCountryTaxDeductible.toStringArray()
)

fun Map<String, ArrayList<String>>.toAsso() = Asso(
    name      = get(SYSTEM_MAP_ASSO_NAME)?.getOrNull(0) ?: "",
    nameLangage = get(SYSTEM_MAP_ASSO_NAME_LANGAGE)?.getOrNull(0) ?: "",
    id        = get(SYSTEM_MAP_ASSO_ID)?.getOrNull(0) ?: "",
    address   = get(SYSTEM_MAP_ASSO_ADDRESS)?.getOrNull(0) ?: "",
    website   = get(SYSTEM_MAP_ASSO_WEBSITE)?.getOrNull(0) ?: "",
    arrayCountryTaxDeductible = get(SYSTEM_MAP_ASSO_TAX_ARRAY).toTaxReceiptCountryArray()
)

// MARK: - ArrayList<Asso> helpers

fun ArrayList<Asso>.withFirstAsso(asso: Asso): ArrayList<Asso> {
    val result = arrayListOf(asso)
    result.addAll(this.filter { it != asso })
    return result
}

fun ArrayList<Asso>.withNoDuplicates(): ArrayList<Asso> {
    val seen = mutableSetOf<Asso>()
    return filterTo(ArrayList()) { seen.add(it) }
}

fun ArrayList<Asso>.toIdArray(): ArrayList<String> =
    ArrayList(map { it.id })

// Suffix used to cache "this asso's tax receipt eligibility is known locally"
fun String.knownSuffixed(): String = this + suffixForAssosIdKnownAsNotDeliveringTaxReceipt
