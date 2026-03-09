/**
 * DOMAIN LAYER — AssoPayout aggregate
 *
 * AssoPayout represents a bank transfer from Tsedaclick to an association.
 * It is modeled as a discriminated union over `status`, which makes illegal
 * states unrepresentable:
 *
 *  - ISSUED    → transfer order sent to Qonto, awaiting confirmation
 *  - COMPLETED → bank confirmed receipt; completedAt and executionRefId are set
 *  - FAILED    → bank rejected the transfer; failureReason is set
 *  - UNKNOWN   → reconciliation needed (e.g. Qonto webhook missed)
 *  - CANCELED  → manually voided; canceledAt is set
 *
 * The `never` constraints on each variant enforce that fields like
 * `failureReason` or `completedAt` cannot exist on incompatible statuses.
 */

// ─── Field name constants ─────────────────────────────────────────────────────

export const ASSO_PAYOUT_FIELD_ID               = "id"
export const ASSO_PAYOUT_FIELD_ASSO_ID          = "assoId"

export const ASSO_PAYOUT_FIELD_DEBIT_AMOUNT     = "debitAmount"
export const ASSO_PAYOUT_FIELD_DEBIT_CURRENCY   = "debitCurrency"

export const ASSO_PAYOUT_FIELD_CREDIT_AMOUNT    = "creditAmount"
export const ASSO_PAYOUT_FIELD_CREDIT_CURRENCY  = "creditCurrency"

export const ASSO_PAYOUT_FIELD_EXECUTION_SOURCE  = "executionSource"
export const ASSO_PAYOUT_FIELD_EXECUTION_REF_ID  = "executionRefId"

export const ASSO_PAYOUT_FIELD_STATUS            = "status"
export const ASSO_PAYOUT_FIELD_FAILURE_REASON    = "failureReason"

export const ASSO_PAYOUT_FIELD_CREATED_AT        = "createdAt"
export const ASSO_PAYOUT_FIELD_COMPLETED_AT      = "completedAt"
export const ASSO_PAYOUT_FIELD_CANCELED_AT       = "canceledAt"

export const ASSO_PAYOUT_FIELD_REFERENCE         = "reference"  // visible to the bank
export const ASSO_PAYOUT_FIELD_NOTE              = "note"       // internal reference

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AssoPayoutStatus {
  ISSUED    = "issued",     // transfer order emitted
  COMPLETED = "completed",  // transfer effectively received
  FAILED    = "failed",     // rejected by the bank
  UNKNOWN   = "unknown",    // undetermined — requires reconciliation
  CANCELED  = "canceled",   // manually voided
}

export enum ExecutionSource {
  QONTO_SEPA     = "qonto_sepa",
  QONTO_TRANSFER = "qonto_transfer",
  STRIPE         = "stripe",
  MANUAL         = "manual",
}

// ─── Shared base ─────────────────────────────────────────────────────────────

type AssoPayoutBase = {
  [ASSO_PAYOUT_FIELD_ID]:             string
  [ASSO_PAYOUT_FIELD_ASSO_ID]:        string

  [ASSO_PAYOUT_FIELD_DEBIT_AMOUNT]:   number
  [ASSO_PAYOUT_FIELD_DEBIT_CURRENCY]: string

  [ASSO_PAYOUT_FIELD_CREDIT_AMOUNT]:   number
  [ASSO_PAYOUT_FIELD_CREDIT_CURRENCY]: string

  [ASSO_PAYOUT_FIELD_EXECUTION_SOURCE]: ExecutionSource
  [ASSO_PAYOUT_FIELD_CREATED_AT]:       Date
}

// ─── Discriminated union ──────────────────────────────────────────────────────

export type AssoPayoutCompleted = AssoPayoutBase & {
  [ASSO_PAYOUT_FIELD_STATUS]:           AssoPayoutStatus.COMPLETED
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]:     Date
  [ASSO_PAYOUT_FIELD_EXECUTION_REF_ID]: string
  [ASSO_PAYOUT_FIELD_REFERENCE]:        string
  [ASSO_PAYOUT_FIELD_NOTE]:             string
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]?:  never
}

export type AssoPayoutFailed = AssoPayoutBase & {
  [ASSO_PAYOUT_FIELD_STATUS]:           AssoPayoutStatus.FAILED
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]?:    never
  [ASSO_PAYOUT_FIELD_EXECUTION_REF_ID]?: string
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]:   string | null
}

export type AssoPayoutUnknown = AssoPayoutBase & {
  [ASSO_PAYOUT_FIELD_STATUS]:           AssoPayoutStatus.UNKNOWN
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]?:    never
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]?:  string | null
}

export type AssoPayoutIssued = AssoPayoutBase & {
  [ASSO_PAYOUT_FIELD_STATUS]:           AssoPayoutStatus.ISSUED
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]?:    never
  [ASSO_PAYOUT_FIELD_EXECUTION_REF_ID]: string
  [ASSO_PAYOUT_FIELD_REFERENCE]:        string
  [ASSO_PAYOUT_FIELD_NOTE]:             string
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]?:  never
}

export type AssoPayoutCanceled = AssoPayoutBase & {
  [ASSO_PAYOUT_FIELD_STATUS]:     AssoPayoutStatus.CANCELED
  [ASSO_PAYOUT_FIELD_CANCELED_AT]: Date
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]?: never
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]?: never
}

/** Discriminated union — exhaustive switch on `status` is enforced by TypeScript */
export type AssoPayout =
  | AssoPayoutCompleted
  | AssoPayoutFailed
  | AssoPayoutUnknown
  | AssoPayoutIssued
  | AssoPayoutCanceled
