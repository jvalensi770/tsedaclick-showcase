/**
 * APPLICATION LAYER — FetchPayoutsUseCase
 *
 * Fetches paginated payouts for an association, or a single payout by ID.
 * Pagination relies on Firestore cursor-based pagination (createdAt timestamp
 * as cursor), which scales regardless of collection size.
 */

import type { Timestamp }            from "firebase-admin/firestore"
import type { AssoPayoutRepository } from "../../infrastructure/firestore/AssoPayoutRepository"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE     = 200

export class FetchPayoutsUseCase {

  constructor(private readonly payoutRepo: AssoPayoutRepository) {}

  async byAsso(
    isProd:   boolean,
    assoId:   string,
    rawLimit: string | undefined,
    beforeTs: Timestamp | null,
  ) {
    const pageSize = clampPageSize(rawLimit)
    return this.payoutRepo.findByAssoId(isProd, assoId, pageSize, beforeTs)
  }

  async byId(isProd: boolean, payoutId: string) {
    return this.payoutRepo.findById(isProd, payoutId)
  }
}

function clampPageSize(raw: string | undefined): number {
  const n = Number(raw) || DEFAULT_PAGE_SIZE
  return Math.min(Math.max(1, n), MAX_PAGE_SIZE)
}
