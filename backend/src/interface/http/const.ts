/**
 * INTERFACE LAYER — Route path constants
 *
 * Single source of truth for all API paths, shared between:
 *  - the Express route handlers (backend)
 *  - the URL builder helpers (frontend/src/api.ts)
 *
 * This prevents path string duplication and keeps frontend/backend in sync.
 */

export const API_BASE_URL_PROD = "https://api.tsedaclick.com"
export const API_BASE_URL_DEMO = "https://api-demo.tsedaclick.com"

export const API_VERSION = "/v1"

export const PATH_HEALTH               = "/health"
export const PATH_ASSO                 = "/assos/:assoId"
export const PATH_ASSO_BANK_ACCOUNT    = "/assos/:assoId/bank-account"
export const PATH_ASSO_TAX_RECEIPT_INFOS = "/assos/:assoId/tax-receipt-infos"
export const PATH_ASSO_CONTACTS        = "/assos/:assoId/contacts"
export const PATH_PROMISES             = "/assos/:assoId/promises"
export const PATH_PAYOUTS              = "/assos/:assoId/payouts"
export const PATH_PAYOUT_BY_ID         = "/payouts/:payoutId"
export const PATH_PAYOUT_PROMISES      = "/payouts/:payoutId/promises"
export const PATH_TAX_RECEIPTS         = "/assos/:assoId/tax-receipts"
export const PATH_SLUG_CHECK           = "/slug-check"
