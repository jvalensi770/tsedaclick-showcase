/**
 * FRONTEND — AssoProvider (React Context)
 *
 * Fetches the association document once and makes it available to all child
 * components via React Context. This avoids prop-drilling assoId/isProd/asso
 * through every component in the dashboard.
 *
 * The `cancelled` flag pattern prevents state updates after unmount, which
 * would otherwise trigger React warnings in development.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { AssoPublic } from "../../../backend/src/domain/asso/AssoPublic"
import { assoUrl } from "../api"

interface AssoContextValue {
  assoId:  string
  isProd:  boolean
  asso:    AssoPublic | null
  loading: boolean
  error:   string | null
}

const AssoContext = createContext<AssoContextValue | null>(null)

export function AssoProvider({
  assoId,
  isProd,
  children,
}: {
  assoId:   string
  isProd:   boolean
  children: ReactNode
}) {
  const [asso,    setAsso]    = useState<AssoPublic | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(assoUrl(isProd, assoId))
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        setAsso(data ?? null)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.message ?? String(err))
        setAsso(null)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [assoId, isProd])

  return (
    <AssoContext.Provider value={{ assoId, isProd, asso, loading, error }}>
      {children}
    </AssoContext.Provider>
  )
}

export function useAssoContext(): AssoContextValue {
  const ctx = useContext(AssoContext)
  if (!ctx) throw new Error("useAssoContext must be used within <AssoProvider>")
  return ctx
}
