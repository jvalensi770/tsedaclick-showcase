/**
 * FRONTEND — useContacts hook
 *
 * Manages notification contacts for the association (add / remove / patch).
 * After each successful mutation, the hook re-fetches the asso to ensure
 * the contacts state stays in sync with the server.
 *
 * The hook reads assoId, isProd, and the current asso from AssoProvider context,
 * so it can be used in any component inside the provider without extra props.
 */

import { useEffect, useState } from "react"
import type { AssoContacts } from "../../../backend/src/domain/asso/AssoContact"
import { assoUrl, contactsUrl } from "../api"
import { useAssoContext } from "./AssoProvider"

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContactEvent =
  | "payment"
  | "payout"
  | "tax_receipt_each"
  | "tax_receipt_yearly"
  | "checkout_custom_fields"

export const CONTACT_EVENTS: ContactEvent[] = [
  "payment",
  "payout",
  "tax_receipt_each",
  "tax_receipt_yearly",
  "checkout_custom_fields",
]

export type ContactInput = {
  method:       "EMAIL" | "WHATSAPP"
  destination:  string
  isEnabled?:   boolean
  displayName?: string
  role?:        string
  locale?:      string
  minAmount?:   number   // payment contacts only
}

export type ContactPatch = Partial<Omit<ContactInput, "method">>

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useContacts() {
  const { asso, assoId, isProd } = useAssoContext()

  const [contacts,   setContacts]   = useState<AssoContacts>(() => (asso as any)?.contacts ?? {})
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Sync contacts whenever the asso is re-fetched by AssoProvider
  useEffect(() => {
    if (asso) setContacts((asso as any).contacts ?? {})
  }, [asso])

  // Re-fetch asso after a mutation to update the local contacts state
  async function refresh() {
    try {
      const res = await fetch(assoUrl(isProd, assoId))
      if (!res.ok) return
      const data = await res.json()
      setContacts(data?.contacts ?? {})
    } catch {
      // Silent — UI already updated optimistically via the mutation response
    }
  }

  async function addContact(event: ContactEvent, contact: ContactInput): Promise<void> {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(contactsUrl(isProd, assoId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, contact }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? "Erreur")
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  async function removeContact(event: ContactEvent, method: string, destination: string): Promise<void> {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(contactsUrl(isProd, assoId), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, method, destination }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? "Erreur")
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  async function patchContact(
    event:       ContactEvent,
    method:      string,
    destination: string,
    patch:       ContactPatch,
  ): Promise<void> {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(contactsUrl(isProd, assoId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, method, destination, patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      await refresh()
    } catch (e: any) {
      setError(e?.message ?? "Erreur")
      throw e
    } finally {
      setSubmitting(false)
    }
  }

  return { contacts, submitting, error, addContact, removeContact, patchContact }
}
