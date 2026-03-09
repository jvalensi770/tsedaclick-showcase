/**
 * DOMAIN LAYER — AssoContact value objects + pure domain logic
 *
 * This file contains:
 *  - Contact types and the AssoContactEvent enum (what triggers a notification)
 *  - Pure validation + normalisation functions (no I/O, fully testable)
 *  - Upsert logic for contact lists (immutable, returns new state)
 *
 * Nothing here touches Firestore. The repository (infrastructure layer) is
 * responsible for persisting the result of these pure functions.
 */

// ─── Field name constants ─────────────────────────────────────────────────────

export const ASSO_CONTACT_OBJ_METHOD       = "method"
export const ASSO_CONTACT_OBJ_DESTINATION  = "destination"
export const ASSO_CONTACT_OBJ_IS_ENABLED   = "isEnabled"
export const ASSO_CONTACT_OBJ_DISPLAY_NAME = "displayName"
export const ASSO_CONTACT_OBJ_ROLE         = "role"
export const ASSO_CONTACT_OBJ_LOCALE       = "locale"
export const EVENT_PAYMENT_MIN_AMOUNT      = "minAmount"

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum AssoContactEvent {
  Payment              = "payment",              // received payment (supports minAmount threshold)
  Payout               = "payout",               // bank transfer executed
  TaxReceiptEach       = "tax_receipt_each",     // CERFA issued per donation
  TaxReceiptYearly     = "tax_receipt_yearly",   // annual CERFA batch
  CheckoutCustomFields = "checkout_custom_fields",
}

export enum ContactMethod {
  Email    = "EMAIL",
  WhatsApp = "WHATSAPP",
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssoContact = {
  [ASSO_CONTACT_OBJ_METHOD]: ContactMethod
  [ASSO_CONTACT_OBJ_DESTINATION]: string
  [ASSO_CONTACT_OBJ_IS_ENABLED]?: boolean       // default: true
  [ASSO_CONTACT_OBJ_DISPLAY_NAME]?: string      // e.g. "David"
  [ASSO_CONTACT_OBJ_ROLE]?: string              // e.g. "Treasurer"
  [ASSO_CONTACT_OBJ_LOCALE]?: string            // ISO 639-1, e.g. "fr"
}

/** Payment contacts extend AssoContact with a minimum-amount filter */
export type AssoPaymentContact = AssoContact & {
  [EVENT_PAYMENT_MIN_AMOUNT]: number
}

export type AssoContacts = Partial<{
  [AssoContactEvent.Payment]:              AssoPaymentContact[]
  [AssoContactEvent.Payout]:               AssoContact[]
  [AssoContactEvent.TaxReceiptEach]:       AssoContact[]
  [AssoContactEvent.TaxReceiptYearly]:     AssoContact[]
  [AssoContactEvent.CheckoutCustomFields]: AssoContact[]
}>

export type AssoContactInput =
  | { event: AssoContactEvent.Payment; contact: AssoPaymentContact }
  | { event: Exclude<AssoContactEvent, AssoContactEvent.Payment>; contact: AssoContact }

// ─── Pure domain functions ────────────────────────────────────────────────────

export function normalizeDestination(method: ContactMethod, dest: string): string {
  if (method === ContactMethod.Email) return dest.trim().toLowerCase()
  return dest.trim().replace(/[\s\-\(\)\.]/g, "")
}

export function buildKey(method: ContactMethod, dest: string): string {
  return `${method}::${dest}`
}

/**
 * Validates and normalises a contact for storage.
 * Throws a descriptive Error for any constraint violation.
 */
export function validateAndNormalizeAssoContact(
  params: AssoContactInput
): AssoContact | AssoPaymentContact {
  const { event, contact } = params

  const method      = contact?.[ASSO_CONTACT_OBJ_METHOD] as ContactMethod | undefined
  const destination = contact?.[ASSO_CONTACT_OBJ_DESTINATION] as string | undefined

  if (!method) throw new Error("Missing contact.method")
  if (!destination || typeof destination !== "string") throw new Error("Missing contact.destination")

  if (method === ContactMethod.Email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) {
      throw new Error(`Invalid email destination: ${destination}`)
    }
  } else if (method === ContactMethod.WhatsApp) {
    const normalised = normalizeDestination(method, destination)
    if (!normalised.startsWith("+") || normalised.length < 8) {
      throw new Error(`Invalid phone destination (expected E.164 '+...'): ${destination}`)
    }
  } else {
    throw new Error(`Unsupported contact method: ${String(method)}`)
  }

  if (event === AssoContactEvent.Payment) {
    const minAmount = (contact as AssoPaymentContact)?.[EVENT_PAYMENT_MIN_AMOUNT]
    if (typeof minAmount !== "number" || Number.isNaN(minAmount) || minAmount < 0) {
      throw new Error("payment contact requires a valid non-negative minAmount")
    }
  }

  // Normalise for storage
  const base: any = {
    ...contact,
    [ASSO_CONTACT_OBJ_METHOD]: method,
    [ASSO_CONTACT_OBJ_DESTINATION]: normalizeDestination(method, destination),
    [ASSO_CONTACT_OBJ_IS_ENABLED]: contact[ASSO_CONTACT_OBJ_IS_ENABLED] ?? true,
  }

  if (event !== AssoContactEvent.Payment) {
    delete base[EVENT_PAYMENT_MIN_AMOUNT]
  }

  return base
}

type UpsertResult = {
  added:      boolean
  merged:     boolean
  key:        string
  newCount:   number
  contacts:   AssoContacts
}

/**
 * PURE function — no Firestore.
 *
 * Upserts a normalised contact into an AssoContacts block.
 * - If the key (method + destination) is new → adds it.
 * - If it already exists → merges intelligently (respects isEnabled=false,
 *   completes missing metadata, takes the lower minAmount for payment events).
 * Returns the updated contacts block and operation metadata.
 */
export function upsertAssoContactInContacts(params: {
  contacts:          AssoContacts | undefined
  event:             AssoContactEvent
  normalizedContact: AssoContact | AssoPaymentContact
}): UpsertResult {
  const { contacts, event, normalizedContact } = params

  const method    = normalizedContact[ASSO_CONTACT_OBJ_METHOD] as ContactMethod
  const dest      = normalizedContact[ASSO_CONTACT_OBJ_DESTINATION] as string
  const key       = buildKey(method, dest)
  const isPayment = event === AssoContactEvent.Payment

  const current     = (contacts ?? {}) as AssoContacts
  const currentList = ((current as any)[event] ?? []) as any[]

  const byKey = new Map<string, any>()
  for (const c of currentList) {
    if (!c) continue
    const m  = c[ASSO_CONTACT_OBJ_METHOD] as ContactMethod | undefined
    const d  = c[ASSO_CONTACT_OBJ_DESTINATION] as string | undefined
    if (!m || !d) continue
    const nd = normalizeDestination(m, d)
    byKey.set(buildKey(m, nd), { ...c, [ASSO_CONTACT_OBJ_DESTINATION]: nd })
  }

  const existing = byKey.get(key)
  let added = false, merged = false

  if (!existing) {
    byKey.set(key, normalizedContact)
    added = true
  } else {
    const out = { ...existing }

    // Complete missing metadata from the incoming contact
    for (const f of [ASSO_CONTACT_OBJ_DISPLAY_NAME, ASSO_CONTACT_OBJ_ROLE, ASSO_CONTACT_OBJ_LOCALE] as const) {
      if (out[f] == null && (normalizedContact as any)[f] != null) {
        out[f] = (normalizedContact as any)[f]
      }
    }

    // Preserve isEnabled=false; otherwise accept the incoming value
    if (out[ASSO_CONTACT_OBJ_IS_ENABLED] !== false) {
      out[ASSO_CONTACT_OBJ_IS_ENABLED] = (normalizedContact as any)[ASSO_CONTACT_OBJ_IS_ENABLED] ?? true
    }

    // Payment: use the lower minAmount (most permissive)
    if (isPayment) {
      const a = typeof out[EVENT_PAYMENT_MIN_AMOUNT] === "number" ? out[EVENT_PAYMENT_MIN_AMOUNT] : 0
      const b = (normalizedContact as any)[EVENT_PAYMENT_MIN_AMOUNT] as number
      out[EVENT_PAYMENT_MIN_AMOUNT] = Math.min(a, b)
    }

    byKey.set(key, out)
    merged = true
  }

  // Rebuild the list, preserving insertion order
  const seen = new Set<string>()
  const rebuilt: any[] = []

  for (const c of currentList) {
    const m  = c?.[ASSO_CONTACT_OBJ_METHOD] as ContactMethod | undefined
    const d  = c?.[ASSO_CONTACT_OBJ_DESTINATION] as string | undefined
    if (!m || !d) continue
    const nd = normalizeDestination(m, d)
    const k  = buildKey(m, nd)
    if (seen.has(k)) continue
    const final = byKey.get(k)
    if (final) { rebuilt.push(final); seen.add(k) }
  }

  if (!seen.has(key)) {
    const final = byKey.get(key)
    if (final) rebuilt.push(final)
  }

  return {
    added, merged, key,
    newCount: rebuilt.length,
    contacts: { ...(current as any), [event]: rebuilt },
  }
}

/**
 * Returns the contacts that should be notified for a given event.
 * Handles deduplication, isEnabled filtering, and minAmount for payment events.
 */
export function getContactsForEvent(params: {
  contacts: AssoContacts | undefined
  event:    AssoContactEvent
  amount?:  number
}): AssoContact[] {
  const { contacts, event, amount } = params
  if (!contacts) return []

  const list = contacts[event]
  if (!list || list.length === 0) return []

  const enabled = (c: AssoContact) => c[ASSO_CONTACT_OBJ_IS_ENABLED] !== false

  if (event !== AssoContactEvent.Payment) {
    return (list as AssoContact[]).filter(enabled)
  }

  const a = amount ?? 0
  return (list as AssoPaymentContact[])
    .filter(enabled)
    .filter(c => a >= c[EVENT_PAYMENT_MIN_AMOUNT])
}
