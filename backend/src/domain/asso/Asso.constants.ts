/**
 * DOMAIN LAYER — Field name constants
 *
 * Storing field names as typed constants (instead of raw strings) enables
 * type-safe refactoring: renaming a field updates both the type definition
 * and every place that reads/writes that field from Firestore.
 */

export const ASSO_OBJ_FIELD_ID                    = "AssoId"
export const ASSO_OBJ_FIELD_CREATION_DATE         = "CreationDate"

export const ASSO_OBJ_FIELD_NAME_I18N             = "nameI18n"
export const ASSO_OBJ_FIELD_ADDRESS_I18N          = "addressI18n"

export const ASSO_OBJ_FIELD_MAIN_CATEGO           = "MainCatego"
export const ASSO_OBJ_FIELD_SUB_CATEGO            = "SubCatego"

export const ASSO_OBJ_FIELD_CONTACTS              = "contacts"

export const ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_MAP      = "tsedaFeeSlopeMap"
export const ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_CURRENCY = "tsedaFeeSlopeCurrency"

export const ASSO_OBJ_FIELD_TAX_RECEIPT_INFOS     = "TaxReceiptInfos"
export const ASSO_OBJ_FIELD_TAX_DEDUCTIBLE_IN     = "TaxDeductibleIn"

export const ASSO_OBJ_FIELD_WEBSITE               = "WebSite"
export const ASSO_OBJ_FIELD_LINK_EXTENSIONS       = "linkExtensions"

export const ASSO_OBJ_FIELD_IS_DISPLAYED          = "isDisplayed"
export const ASSO_OBJ_FIELD_IS_TSEDACHOICE        = "isTsedachoice"
export const ASSO_OBJ_FIELD_USERS_HAVING_ACCESS   = "usersHavingAccess"

export const ASSO_OBJ_FIELD_BANK_ACCOUNT          = "bankAccount"
export const ASSO_OBJ_FIELD_QONTO_BENEFICIARY     = "qontoBeneficiary"

export const ASSO_OBJ_FIELD_WABA_IDS              = "wabaIds"
