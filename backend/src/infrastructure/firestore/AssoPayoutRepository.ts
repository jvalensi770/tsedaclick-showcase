/**
 * INFRASTRUCTURE LAYER — AssoPayoutRepository (Firestore implementation)
 *
 * Handles read queries for AssoPayout documents.
 * Payouts are stored in a Firestore collectionGroup, filterable by assoId.
 * Pagination uses cursor-based timestamps (Firestore Timestamp as cursor).
 */

import type { Firestore, Timestamp } from "firebase-admin/firestore"
import {
  ASSO_PAYOUT_FIELD_ASSO_ID,
  ASSO_PAYOUT_FIELD_CREDIT_AMOUNT,
  ASSO_PAYOUT_FIELD_CREDIT_CURRENCY,
  ASSO_PAYOUT_FIELD_STATUS,
  ASSO_PAYOUT_FIELD_CREATED_AT,
  ASSO_PAYOUT_FIELD_COMPLETED_AT,
  ASSO_PAYOUT_FIELD_FAILURE_REASON,
} from "../../domain/asso/AssoPayout"

// Prod/demo collection name helper (see Asso.constants.ts for rationale)
const ASSO_PAYOUTS_COLL = (isProd: boolean) => isProd ? "AssoPayouts" : "AssoPayoutsDemo"

// ─── Sanitized read model ─────────────────────────────────────────────────────

/**
 * SanitizedPayout strips internal fields (executionRefId, qonto-specific data…)
 * before sending the response to the frontend.
 */
export type SanitizedPayout = {
  id:                                        string
  [ASSO_PAYOUT_FIELD_CREDIT_AMOUNT]:         number
  [ASSO_PAYOUT_FIELD_CREDIT_CURRENCY]:       string
  [ASSO_PAYOUT_FIELD_STATUS]:                string
  [ASSO_PAYOUT_FIELD_CREATED_AT]:            { _seconds: number } | null
  [ASSO_PAYOUT_FIELD_COMPLETED_AT]:          { _seconds: number } | null
  [ASSO_PAYOUT_FIELD_FAILURE_REASON]:        string | null
}

function sanitizePayout(doc: FirebaseFirestore.QueryDocumentSnapshot): SanitizedPayout {
  const d = doc.data()
  return {
    id: doc.id,
    [ASSO_PAYOUT_FIELD_CREDIT_AMOUNT]:    d[ASSO_PAYOUT_FIELD_CREDIT_AMOUNT],
    [ASSO_PAYOUT_FIELD_CREDIT_CURRENCY]:  d[ASSO_PAYOUT_FIELD_CREDIT_CURRENCY],
    [ASSO_PAYOUT_FIELD_STATUS]:           d[ASSO_PAYOUT_FIELD_STATUS],
    [ASSO_PAYOUT_FIELD_CREATED_AT]:       d[ASSO_PAYOUT_FIELD_CREATED_AT]   ?? null,
    [ASSO_PAYOUT_FIELD_COMPLETED_AT]:     d[ASSO_PAYOUT_FIELD_COMPLETED_AT] ?? null,
    [ASSO_PAYOUT_FIELD_FAILURE_REASON]:   d[ASSO_PAYOUT_FIELD_FAILURE_REASON] ?? null,
  }
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class AssoPayoutRepository {

  constructor(private readonly db: Firestore) {}

  /** Fetch a single payout by document ID */
  async findById(isProd: boolean, payoutId: string): Promise<SanitizedPayout | null> {
    const doc = await this.db
      .collection(ASSO_PAYOUTS_COLL(isProd))
      .doc(payoutId)
      .get()

    if (!doc.exists) return null
    return sanitizePayout(doc as FirebaseFirestore.QueryDocumentSnapshot)
  }

  /**
   * Paginated list of payouts for an association.
   *
   * Uses cursor-based pagination: the `beforeTs` cursor is the createdAt
   * timestamp of the last document from the previous page.
   * Returns `nextBefore` (epoch seconds) for the next page, or null if done.
   */
  async findByAssoId(
    isProd:   boolean,
    assoId:   string,
    pageSize: number,
    beforeTs: Timestamp | null,
  ): Promise<{ payouts: SanitizedPayout[]; nextBefore: number | null }> {

    let q = this.db
      .collectionGroup(ASSO_PAYOUTS_COLL(isProd))
      .where(ASSO_PAYOUT_FIELD_ASSO_ID, "==", assoId)
      .orderBy(ASSO_PAYOUT_FIELD_CREATED_AT, "desc")

    if (beforeTs) q = q.startAfter(beforeTs)

    q = q.limit(pageSize)

    const snap    = await q.get()
    const payouts = snap.docs.map(doc => sanitizePayout(doc))

    let nextBefore: number | null = null
    if (payouts.length === pageSize && snap.docs.length > 0) {
      const lastDate = snap.docs[snap.docs.length - 1].data()[ASSO_PAYOUT_FIELD_CREATED_AT]
      const lastSecs = lastDate?._seconds ?? lastDate?.seconds ?? null
      if (typeof lastSecs === "number") nextBefore = lastSecs
    }

    return { payouts, nextBefore }
  }
}
