/**
 * APPLICATION LAYER — FetchPromisesUseCase
 *
 * Retrieves paginated donation promises for an association, enriched with:
 *  - Donor identity (name, email, phone, address) via a batch User lookup
 *  - Payment error details for failed donors (via Stripe API)
 *  - Payout date for paid promises (cross-collection join)
 *
 * Complexity here is intentional: a PromiseToPay document lives inside a User
 * sub-collection. To query by assoId across all users, we use a Firestore
 * collectionGroup query. The two collection groups (paid vs. pending) are
 * merged in memory and re-sorted by date.
 */

import type { Firestore, Timestamp } from "firebase-admin/firestore"

// ─── Field name constants (shared domain) ─────────────────────────────────────
// In the actual codebase these are imported from objects/PromiseToPay/const.ts
const PROMISE_FIELD_ASSO_ID   = "assoId"
const PROMISE_FIELD_DATE      = "Date"
const PROMISE_FIELD_PAYOUT    = "paid"
const PROMISE_FIELD_PAYOUT_ID = "payoutId"

// ─── Collection name helpers ──────────────────────────────────────────────────

const CORR_PROMISES_COLL    = (isProd: boolean) => isProd ? "CorrPromises"     : "CorrPromisesDemo"
const PROMISES_TO_PAY_COLL  = (isProd: boolean) => isProd ? "PromisesToPay"    : "PromisesToPayDemo"
const USERS_COLL            = (isProd: boolean) => isProd ? "Users"            : "UsersDemo"
const ASSO_PAYOUTS_COLL     = (isProd: boolean) => isProd ? "AssoPayouts"      : "AssoPayoutsDemo"
const USER_DOC_EXTENSION    = "_doc"

type PromiseStatus = "paid" | "toPay" | "pending"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE     = 200

export class FetchPromisesUseCase {

  constructor(private readonly db: Firestore) {}

  async byAsso(
    isProd:   boolean,
    assoId:   string,
    rawLimit: string | undefined,
    beforeTs: Timestamp | null,
  ) {
    const pageSize = clampPageSize(rawLimit)

    // ── Step 1: Query both collection groups in parallel ──────────────────────
    // "paid" promises live in CorrPromises (sub-collection of Payments/),
    // "pending" promises live in PromisesToPay (sub-collection of Users/).
    const query = (collName: string) => {
      let q = this.db.collectionGroup(collName)
        .where(PROMISE_FIELD_ASSO_ID, "==", assoId)
        .orderBy(PROMISE_FIELD_DATE, "desc")
      if (beforeTs) q = (q as any).startAfter(beforeTs)
      return q.limit(pageSize).get()
    }

    const [corrSnap, toPaySnap] = await Promise.all([
      query(CORR_PROMISES_COLL(isProd)),
      query(PROMISES_TO_PAY_COLL(isProd)),
    ])

    // ── Step 2: Determine status from the document path ───────────────────────
    const corrDocs = corrSnap.docs.map(doc => ({
      id: doc.id,
      status: resolveStatusFromPath(doc.ref.path, isProd),
      userId: userIdFromPath(doc.ref.path),
      ...doc.data(),
    }))

    const toPayDocs = toPaySnap.docs.map(doc => ({
      id: doc.id,
      status: "toPay" as PromiseStatus,
      userId: userIdFromPath(doc.ref.path),
      ...doc.data(),
    }))

    // ── Step 3: Merge and re-sort (two independent collection groups) ─────────
    const allPromises = [...corrDocs, ...toPayDocs]
    allPromises.sort((a, b) => {
      const tsA = timestampToSeconds((a as any)[PROMISE_FIELD_DATE])
      const tsB = timestampToSeconds((b as any)[PROMISE_FIELD_DATE])
      return tsB - tsA
    })
    const page = allPromises.slice(0, pageSize)

    // ── Step 4: Batch-fetch donor identities ──────────────────────────────────
    const userIds = [...new Set(page.map(p => (p as any).userId as string).filter(Boolean))]
    const donorMap = await this.fetchDonorMap(isProd, userIds)

    // ── Step 5: Enrich promises with payout dates ─────────────────────────────
    const payoutIds = new Set(
      page
        .map(p => (p as any)[PROMISE_FIELD_PAYOUT]?.[PROMISE_FIELD_PAYOUT_ID] as string | undefined)
        .filter((id): id is string => !!id)
    )
    const payoutDateMap = await this.fetchPayoutDates(isProd, assoId, payoutIds)

    const enriched = page.map(p => ({
      ...p,
      donor:      donorMap.get((p as any).userId) ?? null,
      payoutDate: payoutDateMap.get(
        (p as any)[PROMISE_FIELD_PAYOUT]?.[PROMISE_FIELD_PAYOUT_ID]
      ) ?? null,
    }))

    // ── Step 6: Cursor for next page ──────────────────────────────────────────
    let nextBefore: number | null = null
    if (page.length === pageSize) {
      const lastDate = (page[page.length - 1] as any)[PROMISE_FIELD_DATE]
      const secs = timestampToSeconds(lastDate)
      if (secs) nextBefore = secs
    }

    return { promises: enriched, nextBefore }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetchDonorMap(isProd: boolean, userIds: string[]) {
    const map = new Map<string, unknown>()
    if (userIds.length === 0) return map

    const refs = userIds.map(uid =>
      this.db.collection(USERS_COLL(isProd)).doc(uid + USER_DOC_EXTENSION)
    )
    const docs = await this.db.getAll(...refs)

    for (let i = 0; i < userIds.length; i++) {
      const doc = docs[i]
      if (!doc.exists) continue
      const d = doc.data()!

      map.set(userIds[i], {
        email:      d.email      ?? null,
        phone:      d.phoneE164  ?? null,
        firstName:  d.FirstName  ?? null,
        familyName: d.FamilyName ?? null,
        address:    d.Address    ?? null,
        zipCode:    d.ZipCode    ?? null,
        city:       d.City       ?? null,
        country:    d.Country    ?? null,
      })
    }

    return map
  }

  private async fetchPayoutDates(
    isProd:    boolean,
    assoId:    string,
    payoutIds: Set<string>,
  ) {
    const map = new Map<string, { _seconds: number } | null>()
    if (payoutIds.size === 0) return map

    try {
      const snap = await this.db
        .collectionGroup(ASSO_PAYOUTS_COLL(isProd))
        .where("assoId", "==", assoId)
        .orderBy("createdAt", "desc")
        .select("createdAt")
        .get()

      for (const doc of snap.docs) {
        if (payoutIds.has(doc.id)) {
          map.set(doc.id, doc.data()["createdAt"] ?? null)
        }
      }
    } catch (e) {
      console.error("[FetchPromisesUseCase] payout date enrichment failed:", e)
    }

    return map
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function userIdFromPath(path: string): string | null {
  const parts = path.split("/")
  if (parts.length < 2) return null
  const docId = parts[1]
  return docId.endsWith(USER_DOC_EXTENSION)
    ? docId.slice(0, -USER_DOC_EXTENSION.length)
    : null
}

function resolveStatusFromPath(path: string, isProd: boolean): PromiseStatus {
  if (path.includes(isProd ? "PendingPayments/" : "PendingPaymentsDemo/")) return "pending"
  return "paid"
}

function timestampToSeconds(ts: any): number {
  return ts?._seconds ?? ts?.seconds ?? 0
}

function clampPageSize(raw: string | undefined): number {
  const n = Number(raw) || DEFAULT_PAGE_SIZE
  return Math.min(Math.max(1, n), MAX_PAGE_SIZE)
}
