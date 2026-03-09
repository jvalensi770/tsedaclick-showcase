/**
 * DOMAIN LAYER — AssoPublic (sanitized read model)
 *
 * AssoPublic is the shape returned by the REST API.
 * It is derived from the internal Asso document by:
 *  - Picking only the fields safe to expose externally
 *  - Replacing BankAccount (contains full IBAN) with BankAccountPublic (last 4 digits only)
 *
 * This explicit sanitization boundary prevents accidental leakage of sensitive
 * fields (Qonto credentials, internal flags, user access lists…) to the frontend.
 */

import type { Asso, BankAccountPublic } from "./Asso"
import * as asso from "./Asso.constants"

export type AssoPublic =
  Omit<
    Pick<
      Asso,
      | typeof asso.ASSO_OBJ_FIELD_ID
      | typeof asso.ASSO_OBJ_FIELD_CREATION_DATE
      | typeof asso.ASSO_OBJ_FIELD_NAME_I18N
      | typeof asso.ASSO_OBJ_FIELD_ADDRESS_I18N
      | typeof asso.ASSO_OBJ_FIELD_MAIN_CATEGO
      | typeof asso.ASSO_OBJ_FIELD_SUB_CATEGO
      | typeof asso.ASSO_OBJ_FIELD_CONTACTS
      | typeof asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_MAP
      | typeof asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_CURRENCY
      | typeof asso.ASSO_OBJ_FIELD_TAX_RECEIPT_INFOS
      | typeof asso.ASSO_OBJ_FIELD_WEBSITE
      | typeof asso.ASSO_OBJ_FIELD_LINK_EXTENSIONS
      | typeof asso.ASSO_OBJ_FIELD_BANK_ACCOUNT
    >,
    typeof asso.ASSO_OBJ_FIELD_BANK_ACCOUNT // removed from Pick so we can override the type below
  > & {
    [asso.ASSO_OBJ_FIELD_BANK_ACCOUNT]?: BankAccountPublic // masked IBAN
  }

// ─── Sanitization function ────────────────────────────────────────────────────

function sanitizeBankAccountForPublic(
  bankAccount: Asso[typeof asso.ASSO_OBJ_FIELD_BANK_ACCOUNT]
): BankAccountPublic | undefined {
  if (!bankAccount) return undefined
  return {
    ibanLast4: bankAccount.iban.slice(-4),
    beneficiary_name: bankAccount.beneficiary_name,
    verified: bankAccount.verified,
  }
}

export function sanitizeAssoForPublic(assoDoc: Asso): AssoPublic {
  return {
    [asso.ASSO_OBJ_FIELD_ID]:           assoDoc[asso.ASSO_OBJ_FIELD_ID],
    [asso.ASSO_OBJ_FIELD_CREATION_DATE]: assoDoc[asso.ASSO_OBJ_FIELD_CREATION_DATE],

    [asso.ASSO_OBJ_FIELD_NAME_I18N]:    assoDoc[asso.ASSO_OBJ_FIELD_NAME_I18N],
    [asso.ASSO_OBJ_FIELD_ADDRESS_I18N]: assoDoc[asso.ASSO_OBJ_FIELD_ADDRESS_I18N],

    [asso.ASSO_OBJ_FIELD_MAIN_CATEGO]:  assoDoc[asso.ASSO_OBJ_FIELD_MAIN_CATEGO],
    [asso.ASSO_OBJ_FIELD_SUB_CATEGO]:   assoDoc[asso.ASSO_OBJ_FIELD_SUB_CATEGO],

    [asso.ASSO_OBJ_FIELD_CONTACTS]:     assoDoc[asso.ASSO_OBJ_FIELD_CONTACTS],

    [asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_MAP]:      assoDoc[asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_MAP],
    [asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_CURRENCY]: assoDoc[asso.ASSO_OBJ_FIELD_TSEDA_FEE_SLOPE_CURRENCY],

    [asso.ASSO_OBJ_FIELD_TAX_RECEIPT_INFOS]: assoDoc[asso.ASSO_OBJ_FIELD_TAX_RECEIPT_INFOS],

    [asso.ASSO_OBJ_FIELD_WEBSITE]:          assoDoc[asso.ASSO_OBJ_FIELD_WEBSITE],
    [asso.ASSO_OBJ_FIELD_LINK_EXTENSIONS]:  assoDoc[asso.ASSO_OBJ_FIELD_LINK_EXTENSIONS],

    [asso.ASSO_OBJ_FIELD_BANK_ACCOUNT]: sanitizeBankAccountForPublic(
      assoDoc[asso.ASSO_OBJ_FIELD_BANK_ACCOUNT]
    ),
  }
}
