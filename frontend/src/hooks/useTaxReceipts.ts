/**
 * FRONTEND — useTaxReceipts hook
 *
 * Fetches paginated tax receipts (CERFA documents) for the current association.
 * Supports infinite-scroll pagination via `loadMore()`.
 */

import { useEffect, useState, useCallback } from "react"
import { taxReceiptsUrl } from "../api"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SanitizedTaxReceipt {
  id:    string
  title: string | null
  /** Pre-signed public URL for the PDF */
  publicURL: string | null
  userTaxReceiptAddress: {
    FirstName?:  string
    FamilyName?: string
    Address?:    string
    ZipCode?:    string
    City?:       string
    Country?:    string
  } | null
  amountsWithCurrency: Array<{ amount: number; currency: string }> | []
  assoInfos: object | null
  /** Distribution log: one entry per send (email / WhatsApp) */
  distribution: Array<{
    method:      string
    date:        { _seconds: number } | null
    destination: string
    subject?:    string
    status?:     string
    messageId?:  string
  }> | null
  issuerId:          string | null
  yearOfTaxReceipt:  number | null
  CreationDate:      { _seconds: number } | null
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTaxReceipts(assoId: string, isProd: boolean) {
  const [taxReceipts,  setTaxReceipts]  = useState<SanitizedTaxReceipt[]>([])
  const [loading,      setLoading]      = useState(true)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [nextBefore,   setNextBefore]   = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setTaxReceipts([])
    setNextBefore(null)

    async function load() {
      try {
        const res = await fetch(taxReceiptsUrl(isProd, assoId))
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setTaxReceipts(json.taxReceipts ?? [])
          setNextBefore(json.nextBefore ?? null)
        }
      } catch (e) {
        console.error("[useTaxReceipts]", e)
        if (!cancelled) setTaxReceipts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [assoId, isProd])

  const loadMore = useCallback(async () => {
    if (!nextBefore || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(taxReceiptsUrl(isProd, assoId, nextBefore))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setTaxReceipts(prev => [...prev, ...(json.taxReceipts ?? [])])
      setNextBefore(json.nextBefore ?? null)
    } catch (e) {
      console.error("[useTaxReceipts] loadMore:", e)
    } finally {
      setLoadingMore(false)
    }
  }, [assoId, isProd, nextBefore, loadingMore])

  return { taxReceipts, loading, nextBefore, loadMore, loadingMore }
}
