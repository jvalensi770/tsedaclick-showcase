/**
 * FRONTEND — useTransfers / useTransfer hooks
 *
 * `useTransfers`  — list of all payouts for the current association
 * `useTransfer`   — single payout by ID (used on the detail page)
 * `fetchPayoutPromises` — standalone async function for paginated promises
 *                          within a payout (called imperatively on the detail page)
 */

import { useEffect, useState } from "react"
import { payoutsUrl, payoutUrl, payoutPromisesUrl } from "../api"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SanitizedPayout {
  id:             string
  creditAmount:   number
  creditCurrency: string
  status:         string
  createdAt:      { _seconds: number } | null
  completedAt:    { _seconds: number } | null
  failureReason:  string | null
}

/** Per-promise fee breakdown, as returned by GET /payouts/:payoutId/promises */
export interface SanitizedPayoutPromise {
  paymentCurrency:              string | null
  payoutCurrency:               string | null
  fxRate_paymentToPayout:       number
  promiseAmount_paymentCurrency: number
  promiseAmount_payoutCurrency:  number
  stripeFees_payoutCurrency:     number
  tsedaFees_payoutCurrency:      number
  netPayout_payoutCurrency:      number
  date:                          { _seconds: number } | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Paginated list of payouts for an association */
export function useTransfers(assoId: string, isProd: boolean) {
  const [transfers, setTransfers] = useState<SanitizedPayout[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(payoutsUrl(isProd, assoId))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setTransfers(json.payouts ?? [])
      } catch (e) {
        console.error("[useTransfers]", e)
        if (!cancelled) setTransfers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [assoId, isProd])

  return { transfers, loading }
}

/** Single payout by document ID */
export function useTransfer(payoutId: string, isProd: boolean) {
  const [transfer, setTransfer] = useState<SanitizedPayout | null>(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(payoutUrl(isProd, payoutId))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) setTransfer(json)
      } catch (e) {
        console.error("[useTransfer]", e)
        if (!cancelled) setTransfer(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [payoutId, isProd])

  return { transfer, loading }
}

/**
 * Imperative fetch for promises within a payout.
 * Used on TransferDetailPage with manual pagination (Load more button).
 */
export async function fetchPayoutPromises(
  payoutId: string,
  isProd:   boolean,
  before?:  number | null,
): Promise<{ promises: SanitizedPayoutPromise[]; totalCount: number; nextBefore: number | null }> {
  const res = await fetch(payoutPromisesUrl(isProd, payoutId, before))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return {
    promises:   json.promises   ?? [],
    totalCount: json.totalCount ?? 0,
    nextBefore: json.nextBefore ?? null,
  }
}
