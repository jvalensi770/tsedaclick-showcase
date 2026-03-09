/**
 * FRONTEND — API URL builders
 *
 * Single source of truth for all API URLs consumed by the dashboard.
 * Path constants are imported directly from the backend (shared TypeScript
 * monorepo), so frontend and backend paths can never diverge.
 *
 * Usage:
 *   fetch(assoUrl(isProd, assoId))
 *   fetch(promisesUrl(isProd, assoId, nextBefore))
 */

// Imported from backend/src/interface/http/const.ts — same constants, one source
import {
  API_BASE_URL_PROD, API_BASE_URL_DEMO, API_VERSION,
  PATH_ASSO, PATH_PROMISES, PATH_PAYOUTS,
  PATH_PAYOUT_BY_ID, PATH_PAYOUT_PROMISES,
  PATH_ASSO_CONTACTS, PATH_TAX_RECEIPTS,
} from "../../backend/src/interface/http/const"

export function apiBaseUrl(isProd: boolean): string {
  return isProd ? API_BASE_URL_PROD : API_BASE_URL_DEMO
}

/** GET /v1/assos/:assoId */
export function assoUrl(isProd: boolean, assoId: string): string {
  return `${apiBaseUrl(isProd)}${API_VERSION}${PATH_ASSO.replace(":assoId", assoId)}`
}

/** GET /v1/assos/:assoId/promises */
export function promisesUrl(isProd: boolean, assoId: string, before?: number | null): string {
  const base = `${apiBaseUrl(isProd)}${API_VERSION}${PATH_PROMISES.replace(":assoId", assoId)}`
  return before != null ? `${base}?before=${before}` : base
}

/** GET /v1/assos/:assoId/payouts */
export function payoutsUrl(isProd: boolean, assoId: string, before?: number | null): string {
  const base = `${apiBaseUrl(isProd)}${API_VERSION}${PATH_PAYOUTS.replace(":assoId", assoId)}`
  return before != null ? `${base}?before=${before}` : base
}

/** GET /v1/payouts/:payoutId */
export function payoutUrl(isProd: boolean, payoutId: string): string {
  return `${apiBaseUrl(isProd)}${API_VERSION}${PATH_PAYOUT_BY_ID.replace(":payoutId", payoutId)}`
}

/** GET /v1/payouts/:payoutId/promises */
export function payoutPromisesUrl(isProd: boolean, payoutId: string, before?: number | null): string {
  const base = `${apiBaseUrl(isProd)}${API_VERSION}${PATH_PAYOUT_PROMISES.replace(":payoutId", payoutId)}`
  return before != null ? `${base}?before=${before}` : base
}

/** POST | DELETE | PATCH /v1/assos/:assoId/contacts */
export function contactsUrl(isProd: boolean, assoId: string): string {
  return `${apiBaseUrl(isProd)}${API_VERSION}${PATH_ASSO_CONTACTS.replace(":assoId", assoId)}`
}

/** GET /v1/assos/:assoId/tax-receipts */
export function taxReceiptsUrl(isProd: boolean, assoId: string, before?: number | null): string {
  const base = `${apiBaseUrl(isProd)}${API_VERSION}${PATH_TAX_RECEIPTS.replace(":assoId", assoId)}`
  return before != null ? `${base}?before=${before}` : base
}
