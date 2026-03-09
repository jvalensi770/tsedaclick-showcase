/**
 * INFRASTRUCTURE LAYER — AssoRepository (Firestore implementation)
 *
 * Implements IAssoRepository using Firebase Admin SDK.
 * All Firestore-specific concerns live here:
 *  - Collection name resolution (prod vs demo Firestore namespacing)
 *  - Transactions for concurrent writes
 *  - Qonto API call to verify the SEPA payee before persisting BankAccount
 *
 * The application layer only sees IAssoRepository — it never imports this file.
 */

import type { Firestore, CollectionReference } from "firebase-admin/firestore"
import type { IAssoRepository, SepaInput, ContactPatch } from "./IAssoRepository"
import type { AssoPublic }       from "../../domain/asso/AssoPublic"
import type { Asso }             from "../../domain/asso/Asso"
import type { AssoContactInput, AssoContactEvent, ContactMethod } from "../../domain/asso/AssoContact"
import { sanitizeAssoForPublic } from "../../domain/asso/AssoPublic"
import {
  ASSO_OBJ_FIELD_CONTACTS,
  ASSO_OBJ_FIELD_BANK_ACCOUNT,
  ASSO_OBJ_FIELD_QONTO_BENEFICIARY,
} from "../../domain/asso/Asso.constants"
import {
  validateAndNormalizeAssoContact,
  upsertAssoContactInContacts,
  normalizeDestination,
  buildKey,
  ASSO_CONTACT_OBJ_METHOD,
  ASSO_CONTACT_OBJ_DESTINATION,
  type AssoContacts,
} from "../../domain/asso/AssoContact"

// Prod/demo collection name helper
// Pattern used throughout the codebase: a single isProd boolean determines
// which Firestore collection (or sub-collection) is targeted.
const ASSOS_COLL = (isProd: boolean) => isProd ? "Assos" : "AssosDemo"

export class AssoRepository implements IAssoRepository {

  constructor(
    private readonly db: Firestore,
    /**
     * In production, access_token() fetches a fresh Qonto OAuth token from
     * Firestore (tokens are rotated periodically and cached).
     * Injected to keep the repository testable without live Qonto credentials.
     */
    private readonly getQontoToken: (isProd: boolean) => Promise<string>,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private assosColl(isProd: boolean): CollectionReference<Asso> {
    return this.db.collection(ASSOS_COLL(isProd)) as CollectionReference<Asso>
  }

  // ── IAssoRepository ─────────────────────────────────────────────────────────

  async findById(isProd: boolean, assoId: string): Promise<AssoPublic | null> {
    const snap = await this.assosColl(isProd).doc(assoId).get()
    if (!snap.exists) return null
    return sanitizeAssoForPublic(snap.data() as Asso)
  }

  async updateBankAccount(isProd: boolean, assoId: string, sepaInput: SepaInput) {
    // 1. Verify the payee against Qonto (external I/O)
    const token = await this.getQontoToken(isProd)
    const { bankAccount, qontoBeneficiary } = await verifyQontoPayee(isProd, token, sepaInput)

    // 2. Persist both fields atomically
    await this.assosColl(isProd).doc(assoId).update({
      [ASSO_OBJ_FIELD_BANK_ACCOUNT]:       bankAccount,
      [ASSO_OBJ_FIELD_QONTO_BENEFICIARY]:  qontoBeneficiary,
    })

    return { bankAccount, qontoBeneficiary }
  }

  async addContact(isProd: boolean, assoId: string, input: AssoContactInput) {
    // Domain validation is pure — happens before the transaction
    const normalized = validateAndNormalizeAssoContact(input)
    const docRef = this.assosColl(isProd).doc(assoId)

    return docRef.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(docRef)
      if (!snap.exists) throw new Error(`Asso not found: ${assoId}`)

      const contacts = ((snap.data() ?? {})[ASSO_OBJ_FIELD_CONTACTS] ?? {}) as AssoContacts

      // Pure domain function computes the new state — no side effects
      const result = upsertAssoContactInContacts({
        contacts,
        event: input.event,
        normalizedContact: normalized,
      })

      tx.update(docRef, { [ASSO_OBJ_FIELD_CONTACTS]: result.contacts })

      return { added: result.added, merged: result.merged, key: result.key, newCount: result.newCount }
    })
  }

  async removeContact(
    isProd: boolean,
    assoId: string,
    params: { event: AssoContactEvent; method: ContactMethod; destination: string },
  ) {
    const { event, method, destination } = params
    const key    = buildKey(method, normalizeDestination(method, destination))
    const docRef = this.assosColl(isProd).doc(assoId)

    return docRef.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(docRef)
      if (!snap.exists) throw new Error(`Asso not found: ${assoId}`)

      const contacts    = ((snap.data() ?? {})[ASSO_OBJ_FIELD_CONTACTS] ?? {}) as AssoContacts
      const currentList = ((contacts as any)[event] ?? []) as any[]

      const newList = currentList.filter((c: any) => {
        const m = c?.[ASSO_CONTACT_OBJ_METHOD]     as ContactMethod | undefined
        const d = c?.[ASSO_CONTACT_OBJ_DESTINATION] as string | undefined
        if (!m || !d) return false
        return buildKey(m, normalizeDestination(m, d)) !== key
      })

      const removed = newList.length < currentList.length
      tx.update(docRef, { [ASSO_OBJ_FIELD_CONTACTS]: { ...contacts, [event]: newList } })
      return { removed, key, newCount: newList.length }
    })
  }

  async patchContact(
    isProd: boolean,
    assoId: string,
    params: { event: AssoContactEvent; method: ContactMethod; destination: string; patch: ContactPatch },
  ) {
    const { event, method, destination, patch } = params
    const oldKey = buildKey(method, normalizeDestination(method, destination))
    const docRef = this.assosColl(isProd).doc(assoId)

    return docRef.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(docRef)
      if (!snap.exists) throw new Error(`Asso not found: ${assoId}`)

      const contacts    = ((snap.data() ?? {})[ASSO_OBJ_FIELD_CONTACTS] ?? {}) as AssoContacts
      const currentList = ((contacts as any)[event] ?? []) as any[]

      const existingIdx = currentList.findIndex((c: any) => {
        const m = c?.[ASSO_CONTACT_OBJ_METHOD]     as ContactMethod | undefined
        const d = c?.[ASSO_CONTACT_OBJ_DESTINATION] as string | undefined
        if (!m || !d) return false
        return buildKey(m, normalizeDestination(m, d)) === oldKey
      })

      if (existingIdx === -1) {
        throw new Error(`Contact not found: "${oldKey}" in event "${event}"`)
      }

      const merged     = { ...currentList[existingIdx], ...patch }
      // Re-validate the merged contact through the domain function
      const normalized = validateAndNormalizeAssoContact({ event, contact: merged } as AssoContactInput)
      const newKey     = buildKey(method, (normalized as any)[ASSO_CONTACT_OBJ_DESTINATION])

      const newList       = [...currentList]
      newList[existingIdx] = normalized
      tx.update(docRef, { [ASSO_OBJ_FIELD_CONTACTS]: { ...contacts, [event]: newList } })
      return { oldKey, newKey, newCount: newList.length }
    })
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Calls the Qonto API to verify the SEPA payee and create a beneficiary.
 * Returns both the canonical BankAccount and the Qonto beneficiary snapshot.
 * (Implementation detail — lives in infrastructure, not domain)
 */
async function verifyQontoPayee(
  _isProd: boolean,
  _token:  string,
  sepaInput: SepaInput,
): Promise<{ bankAccount: unknown; qontoBeneficiary: unknown }> {
  // Production: calls Qonto's SEPA beneficiary verification endpoint.
  // Full implementation in utils/qonto/beneficiaries.ts
  throw new Error("verifyQontoPayee: see utils/qonto/beneficiaries.ts for implementation")
}
