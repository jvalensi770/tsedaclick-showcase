/**
 * FRONTEND — useDonations hook
 *
 * Fetches paginated donation promises for the current association.
 * Pagination uses cursor-based `before` (epoch seconds), appending results
 * to the existing list on each `loadMore()` call.
 *
 * The `useRef` for the cursor (instead of useState) prevents unnecessary
 * re-renders while still letting loadMore() always read the latest value.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { promisesUrl } from "../api"

export type DonationStatus = "paid" | "toPay" | "pending"

export interface DonationRow {
  id:     string
  status: DonationStatus
  donor:  {
    email:      string | null
    phone:      string | null
    firstName:  string | null
    familyName: string | null
    address:    string | null
    zipCode:    string | null
    city:       string | null
    country:    string | null
    lastPaymentError: {
      code:        string
      declineCode: string | null
      message:     string | null
    } | null
  } | null
  payoutDate: { _seconds: number } | null
  [key: string]: unknown
}

interface ApiResponse {
  promises:   DonationRow[]
  nextBefore: number | null
}

export function useDonations(assoId: string, isProd: boolean) {
  const [donations,    setDonations]    = useState<DonationRow[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [hasMore,      setHasMore]      = useState(false)
  const nextBeforeRef = useRef<number | null>(null)

  // Initial fetch — resets on assoId or isProd change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    nextBeforeRef.current = null

    fetch(promisesUrl(isProd, assoId, null))
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<ApiResponse>
      })
      .then((data) => {
        if (cancelled) return
        setDonations(data?.promises ?? [])
        nextBeforeRef.current = data?.nextBefore ?? null
        setHasMore(data?.nextBefore != null)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? String(err))
        setDonations([])
        setHasMore(false)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [assoId, isProd])

  // Load next page and append to the list
  const loadMore = useCallback(() => {
    if (loadingMore || nextBeforeRef.current == null) return

    setLoadingMore(true)
    fetch(promisesUrl(isProd, assoId, nextBeforeRef.current))
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json() as Promise<ApiResponse>
      })
      .then((data) => {
        setDonations((prev) => [...prev, ...(data?.promises ?? [])])
        nextBeforeRef.current = data?.nextBefore ?? null
        setHasMore(data?.nextBefore != null)
        setLoadingMore(false)
      })
      .catch((err) => {
        setError(err?.message ?? String(err))
        setLoadingMore(false)
      })
  }, [assoId, isProd, loadingMore])

  return { donations, loading, loadingMore, error, hasMore, loadMore }
}
