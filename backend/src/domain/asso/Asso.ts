/**
 * DOMAIN LAYER — Asso aggregate root
 *
 * The `Asso` type is the canonical Firestore document shape for an association.
 * All field accesses use typed string constants (see Asso.constants.ts) to make
 * Firestore field names refactorable without touching raw strings.
 *
 * External dependencies are typed stubs here; in production they come from
 * shared workspace packages (objects/, utils/).
 */

import * as asso from "./Asso.constants"
import type { AssoContacts } from "./AssoContact"

// ─── Value object stubs (defined in shared packages) ──────────────────────────

/** ISO 4217 currency codes supported by the platform */
export type Currency = "EUR" | "USD" | "GBP" | "ILS" | string

/** Localized string map: { "fr": "...", "en": "...", "he": "..." } */
export type LocalizedStringMap = Record<string, string>

/** Localized category map: { "fr": "Association", "en": "Nonprofit" } */
export type LocalizedCategoMap = Record<string, string>

/** Flat fee-slope structure per currency bracket */
export type TsedaFeeSlopeMap = Record<string, number>

/** ISO-3166-1 alpha-2 country codes for tax deductibility */
export type TaxReceiptCountry = "FR" | "IL" | "US" | string

/** Canonical IBAN bank account */
export type BankAccount = {
  iban: string
  bic?: string
  beneficiary_name: string
  verified: boolean
  verifiedAt?: Date
}

/** Public portion of BankAccount (no full IBAN) */
export type BankAccountPublic = {
  ibanLast4: string
  beneficiary_name: string
  verified: boolean
}

/** Qonto SEPA beneficiary snapshot (mirrors Qonto API response) */
export type QontoBeneficiary = {
  id: string
  iban: string
  name: string
}

/** Tax-receipt configuration per country/regime */
export type TaxReceiptInfos = Record<string, unknown>

// ─── Asso aggregate ───────────────────────────────────────────────────────────

export type Asso = {
  [asso.ASSO_OBJ_FIELD_ID]: string
  [asso.ASSO_OBJ_FIELD_CREATION_DATE]: Date

  [asso.ASSO_OBJ_FIELD_NAME_I18N]: LocalizedStringMap
  [asso.ASSO_OBJ_FIELD_ADDRESS_I18N]: LocalizedStringMap

  [asso.ASSO_OBJ_FIELD_MAIN_CATEGO]: LocalizedCategoMap
  [asso.ASSO_OBJ_FIELD_SUB_CATEGO]: LocalizedCategoMap

  [asso.ASSO_OBJ_FIELD_CONTACTS]: AssoContacts

  [asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_MAP]: TsedaFeeSlopeMap
  [asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_CURRENCY]: Currency

  [asso.ASSO_OBJ_FIELD_TAX_RECEIPT_INFOS]: TaxReceiptInfos

  /** @deprecated Required by legacy iOS client — derived from taxReceiptInfos */
  [asso.ASSO_OBJ_FIELD_TAX_DEDUCTIBLE_IN]: TaxReceiptCountry[]

  [asso.ASSO_OBJ_FIELD_WEBSITE]: string
  [asso.ASSO_OBJ_FIELD_LINK_EXTENSIONS]?: string[]

  [asso.ASSO_OBJ_FIELD_IS_DISPLAYED]: boolean
  [asso.ASSO_OBJ_FIELD_IS_TSEDACHOICE]: boolean
  [asso.ASSO_OBJ_FIELD_USERS_HAVING_ACCESS]: string[]

  [asso.ASSO_OBJ_FIELD_WABA_IDS]?: string[]

  /**
   * BankAccount is the canonical source for payouts.
   * QontoBeneficiary mirrors the state of the beneficiary on Qonto side.
   * Fields may overlap but MUST NOT be merged: they represent two separate
   * systems of record.
   */
  [asso.ASSO_OBJ_FIELD_BANK_ACCOUNT]?: BankAccount
  [asso.ASSO_OBJ_FIELD_QONTO_BENEFICIARY]?: QontoBeneficiary
}
