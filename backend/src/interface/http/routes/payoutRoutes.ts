/**
 * INTERFACE LAYER — Payout & Promise HTTP routes
 *
 * Routes:
 *  GET /v1/assos/:assoId/payouts          — paginated payouts for an asso
 *  GET /v1/payouts/:payoutId              — single payout
 *  GET /v1/payouts/:payoutId/promises     — paginated promises within a payout
 *  GET /v1/assos/:assoId/promises         — paginated promises for an asso (all statuses)
 */

import type { Router }               from "express"
import type { Timestamp }             from "firebase-admin/firestore"
import type { FetchPayoutsUseCase }  from "../../../application/asso/FetchPayoutsUseCase"
import type { FetchPromisesUseCase } from "../../../application/asso/FetchPromisesUseCase"
import {
  PATH_PAYOUTS, PATH_PAYOUT_BY_ID, PATH_PAYOUT_PROMISES, PATH_PROMISES,
} from "../const"

declare const admin: { firestore: { Timestamp: { fromMillis(ms: number): Timestamp } } }
declare function ok(res: any, data: unknown): void
declare function badRequest(res: any, message: string): void
declare function notFound(res: any, message: string): void
declare function methodNotAllowed(res: any, allowed: string): void

type UseCases = {
  fetchPayouts:  FetchPayoutsUseCase
  fetchPromises: FetchPromisesUseCase
}

/** Parse an optional `before` query param (epoch seconds) into a Firestore Timestamp */
function parseBeforeTs(raw: string | undefined): Timestamp | null {
  if (!raw) return null
  return admin.firestore.Timestamp.fromMillis(Number(raw) * 1000)
}

export function registerPayoutRoutes(router: Router, isProd: boolean, uc: UseCases) {

  // ── GET /v1/assos/:assoId/payouts ─────────────────────────────────────────

  router.get(PATH_PAYOUTS, async (req, res) => {
    const { assoId }  = req.params
    const { before, limit } = req.query as Record<string, string>
    try {
      const result = await uc.fetchPayouts.byAsso(isProd, assoId, limit, parseBeforeTs(before))
      ok(res, result)
    } catch (e: any) {
      console.error("[GET /assos/:assoId/payouts]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })
  router.all(PATH_PAYOUTS, (_req, res) => methodNotAllowed(res, "GET"))

  // ── GET /v1/payouts/:payoutId ─────────────────────────────────────────────

  router.get(PATH_PAYOUT_BY_ID, async (req, res) => {
    const { payoutId } = req.params
    try {
      const payout = await uc.fetchPayouts.byId(isProd, payoutId)
      if (!payout) { notFound(res, "Payout not found"); return }
      ok(res, payout)
    } catch (e: any) {
      console.error("[GET /payouts/:payoutId]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })
  router.all(PATH_PAYOUT_BY_ID, (_req, res) => methodNotAllowed(res, "GET"))

  // ── GET /v1/payouts/:payoutId/promises ────────────────────────────────────

  router.get(PATH_PAYOUT_PROMISES, async (req, res) => {
    const { payoutId } = req.params
    const { before, limit } = req.query as Record<string, string>
    try {
      const result = await uc.fetchPromises.byPayout(isProd, payoutId, limit, parseBeforeTs(before))
      ok(res, result)
    } catch (e: any) {
      console.error("[GET /payouts/:payoutId/promises]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })
  router.all(PATH_PAYOUT_PROMISES, (_req, res) => methodNotAllowed(res, "GET"))

  // ── GET /v1/assos/:assoId/promises ────────────────────────────────────────

  router.get(PATH_PROMISES, async (req, res) => {
    const { assoId }  = req.params
    const { before, limit } = req.query as Record<string, string>
    try {
      const result = await uc.fetchPromises.byAsso(isProd, assoId, limit, parseBeforeTs(before))
      ok(res, result)
    } catch (e: any) {
      console.error("[GET /assos/:assoId/promises]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })
  router.all(PATH_PROMISES, (_req, res) => methodNotAllowed(res, "GET"))
}
