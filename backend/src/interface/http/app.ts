/**
 * INTERFACE LAYER — Express app factory
 *
 * Creates and configures the Express application:
 *  - JSON body parsing
 *  - CORS middleware (origin whitelist, preflight handling)
 *  - Versioned router (/v1) with all routes registered
 *
 * The app is created once per environment (prod / demo) via `createApp(isProd)`.
 * Firebase Cloud Functions wraps the resulting app with `httpsOnRequest`.
 *
 * Use cases are injected here (composition root) — routes receive them as
 * arguments, keeping route handlers free of direct infrastructure imports.
 */

import express, { type Router }    from "express"
import { registerAssoRoutes }       from "./routes/assoRoutes"
import { registerPayoutRoutes }     from "./routes/payoutRoutes"
import { API_VERSION }              from "./const"

// Infrastructure
import { AssoRepository }           from "../../infrastructure/firestore/AssoRepository"
import { AssoPayoutRepository }     from "../../infrastructure/firestore/AssoPayoutRepository"

// Application
import { FetchAssoUseCase }         from "../../application/asso/FetchAssoUseCase"
import { UpdateBankAccountUseCase } from "../../application/asso/UpdateBankAccountUseCase"
import { ManageContactsUseCase }    from "../../application/asso/ManageContactsUseCase"
import { FetchPayoutsUseCase }      from "../../application/asso/FetchPayoutsUseCase"
import { FetchPromisesUseCase }     from "../../application/asso/FetchPromisesUseCase"

// Shared utils (Firebase Admin, CORS helpers)
// import { db } from "../../shared/firebase-admin"
// import { corsMiddleware } from "../../shared/cors"
// import { getQontoToken } from "../../shared/qonto"

declare const db: FirebaseFirestore.Firestore
declare const corsMiddleware: express.RequestHandler
declare const getQontoToken: (isProd: boolean) => Promise<string>

export function createApp(isProd: boolean): express.Application {
  const app = express()
  app.use(express.json())
  app.use(corsMiddleware)

  // ── Composition root: wire infrastructure → application ────────────────────
  const assoRepo    = new AssoRepository(db, getQontoToken)
  const payoutRepo  = new AssoPayoutRepository(db)

  const fetchAsso          = new FetchAssoUseCase(assoRepo)
  const updateBankAccount  = new UpdateBankAccountUseCase(assoRepo)
  const manageContacts     = new ManageContactsUseCase(assoRepo)
  const fetchPayouts       = new FetchPayoutsUseCase(payoutRepo)
  const fetchPromises      = new FetchPromisesUseCase(db)

  // ── Router ─────────────────────────────────────────────────────────────────
  const v1: Router = express.Router()

  registerAssoRoutes(v1, isProd, { fetchAsso, updateBankAccount, manageContacts })
  registerPayoutRoutes(v1, isProd, { fetchPayouts, fetchPromises })

  app.use(API_VERSION, v1)
  return app
}
