/**
 * INTERFACE LAYER — Asso HTTP routes
 *
 * Each route handler:
 *  1. Parses and validates input (path params, body)
 *  2. Delegates to the appropriate use case
 *  3. Maps the result to an HTTP response
 *
 * Route handlers contain no business logic — they are thin adapters between
 * the HTTP protocol and the application layer.
 *
 * Each path also registers a catch-all `router.all()` that returns 405 for
 * unsupported methods, ensuring the API never silently ignores wrong verbs.
 */

import type { Router } from "express"
import type { FetchAssoUseCase }         from "../../../application/asso/FetchAssoUseCase"
import type { UpdateBankAccountUseCase } from "../../../application/asso/UpdateBankAccountUseCase"
import type { ManageContactsUseCase }    from "../../../application/asso/ManageContactsUseCase"
import { AssoContactEvent }              from "../../../domain/asso/AssoContact"
import {
  PATH_ASSO,
  PATH_ASSO_BANK_ACCOUNT,
  PATH_ASSO_TAX_RECEIPT_INFOS,
  PATH_ASSO_CONTACTS,
} from "../const"

// Response helpers from shared utils (respondWithOk, respondWithBadRequest, …)
// Thin wrappers around res.status().json() with consistent shape: { data } | { error }
declare function ok(res: any, data: unknown): void
declare function badRequest(res: any, message: string): void
declare function notFound(res: any, message: string): void
declare function methodNotAllowed(res: any, allowed: string): void

type UseCases = {
  fetchAsso:         FetchAssoUseCase
  updateBankAccount: UpdateBankAccountUseCase
  manageContacts:    ManageContactsUseCase
}

export function registerAssoRoutes(router: Router, isProd: boolean, uc: UseCases) {

  // ── GET /v1/assos/:assoId ──────────────────────────────────────────────────

  router.get(PATH_ASSO, async (req, res) => {
    const { assoId } = req.params
    try {
      const asso = await uc.fetchAsso.execute(isProd, assoId)
      if (!asso) { notFound(res, "Asso not found"); return }
      ok(res, asso)
    } catch (e: any) {
      console.error("[GET /assos/:assoId]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })
  router.all(PATH_ASSO, (_req, res) => methodNotAllowed(res, "GET"))

  // ── PUT /v1/assos/:assoId/bank-account ────────────────────────────────────

  router.put(PATH_ASSO_BANK_ACCOUNT, async (req, res) => {
    const { assoId }              = req.params
    const { iban, beneficiary_name } = req.body ?? {}

    if (!iban?.trim())             { badRequest(res, 'Missing "iban"');             return }
    if (!beneficiary_name?.trim()) { badRequest(res, 'Missing "beneficiary_name"'); return }

    try {
      const result = await uc.updateBankAccount.execute(isProd, assoId, { iban, beneficiary_name })
      ok(res, result)
    } catch (e: any) {
      const qontoMsg = e?.response?.data?.message ?? e?.response?.data?.errors?.[0]?.detail
      console.error("[PUT /assos/:assoId/bank-account]", e?.message, e?.response?.data ?? "")
      badRequest(res, qontoMsg ?? e?.message ?? String(e))
    }
  })
  router.all(PATH_ASSO_BANK_ACCOUNT, (_req, res) => methodNotAllowed(res, "PUT"))

  // ── POST /v1/assos/:assoId/contacts ───────────────────────────────────────

  router.post(PATH_ASSO_CONTACTS, async (req, res) => {
    const { assoId }       = req.params
    const { event, contact } = req.body ?? {}

    if (!event || !Object.values(AssoContactEvent).includes(event)) {
      badRequest(res, `Invalid "event". Must be one of: ${Object.values(AssoContactEvent).join(", ")}`); return
    }
    if (!contact || typeof contact !== "object" || Array.isArray(contact)) {
      badRequest(res, 'Missing or invalid "contact"'); return
    }

    try {
      const result = await uc.manageContacts.add(isProd, assoId, { event, contact } as any)
      ok(res, result)
    } catch (e: any) {
      if (e?.message?.includes("not found")) { notFound(res, e.message); return }
      console.error("[POST /assos/:assoId/contacts]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })

  // ── DELETE /v1/assos/:assoId/contacts ─────────────────────────────────────

  router.delete(PATH_ASSO_CONTACTS, async (req, res) => {
    const { assoId }                  = req.params
    const { event, method, destination } = req.body ?? {}

    if (!event || !Object.values(AssoContactEvent).includes(event)) {
      badRequest(res, `Invalid "event"`); return
    }
    if (!method || !destination) { badRequest(res, 'Missing "method" or "destination"'); return }

    try {
      const result = await uc.manageContacts.remove(isProd, assoId, { event, method, destination } as any)
      if (!result.removed) { notFound(res, `Contact not found: "${result.key}"`); return }
      ok(res, result)
    } catch (e: any) {
      if (e?.message?.includes("not found")) { notFound(res, e.message); return }
      console.error("[DELETE /assos/:assoId/contacts]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })

  // ── PATCH /v1/assos/:assoId/contacts ──────────────────────────────────────

  router.patch(PATH_ASSO_CONTACTS, async (req, res) => {
    const { assoId }                          = req.params
    const { event, method, destination, patch } = req.body ?? {}

    if (!event || !Object.values(AssoContactEvent).includes(event)) {
      badRequest(res, `Invalid "event"`); return
    }
    if (!method || !destination)                                 { badRequest(res, 'Missing "method" or "destination"'); return }
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || !Object.keys(patch).length) {
      badRequest(res, '"patch" must be a non-empty object'); return
    }

    try {
      const result = await uc.manageContacts.patch(isProd, assoId, { event, method, destination, patch } as any)
      ok(res, result)
    } catch (e: any) {
      if (e?.message?.includes("not found")) { notFound(res, e.message); return }
      console.error("[PATCH /assos/:assoId/contacts]", e)
      badRequest(res, e?.message ?? String(e))
    }
  })

  router.all(PATH_ASSO_CONTACTS, (_req, res) => methodNotAllowed(res, "POST, DELETE, PATCH"))
}
