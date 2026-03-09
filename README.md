# Tsedaclick — Asso Domain Showcase

> **Context:** Tsedaclick is a Firebase-based fintech platform for nonprofit donation management (payments, tax receipts, recurring billing, SEPA payouts). This repository exposes the **Asso domain** as a standalone, readable sample of the production codebase, reorganised with explicit DDD layering.

---

## Architecture: Domain-Driven Design

The codebase is structured in four layers. Each layer only depends on the layers below it — never upward.

```
┌──────────────────────────────────────────────────────┐
│  interface/http/          REST API (Express routes)  │  ← HTTP adapters only
│                                                      │
│  application/asso/        Use Cases                  │  ← orchestration
│                                                      │
│  infrastructure/firestore/ Repositories              │  ← Firestore / Qonto I/O
│                                                      │
│  domain/asso/             Types + pure logic         │  ← no dependencies
└──────────────────────────────────────────────────────┘
```

---

## Layer by layer

### `domain/` — Types and pure business logic

Contains the aggregates, value objects, and pure functions that encode the domain rules. **No I/O, no framework, no side effects.** Everything here is independently testable.

| File | What it shows |
|---|---|
| [`Asso.ts`](backend/src/domain/asso/Asso.ts) | Main aggregate root — all fields typed against string constants |
| [`Asso.constants.ts`](backend/src/domain/asso/Asso.constants.ts) | Field name constants — enables type-safe Firestore refactoring |
| [`AssoPublic.ts`](backend/src/domain/asso/AssoPublic.ts) | Sanitized read model exposed via API — explicit field whitelist, masked IBAN |
| [`AssoContact.ts`](backend/src/domain/asso/AssoContact.ts) | Contact value objects + pure upsert/validation logic (enum-keyed, deduplication, minAmount merge) |
| [`AssoPayout.ts`](backend/src/domain/asso/AssoPayout.ts) | Discriminated union over payout status — illegal states unrepresentable via `never` constraints |

**Key pattern — field name constants:**
```typescript
// Instead of raw strings scattered across the codebase:
export const ASSO_OBJ_FIELD_CONTACTS = "contacts"

// The type uses it as a computed key:
export type Asso = {
  [ASSO_OBJ_FIELD_CONTACTS]: AssoContacts
}

// Firestore reads/writes use the same constant:
tx.update(docRef, { [ASSO_OBJ_FIELD_CONTACTS]: newContacts })
```
Renaming a Firestore field = changing one constant, TypeScript catches every usage site.

---

### `infrastructure/` — Repository pattern (Firestore)

| File | What it shows |
|---|---|
| [`IAssoRepository.ts`](backend/src/infrastructure/firestore/IAssoRepository.ts) | Interface — the contract the application layer depends on |
| [`AssoRepository.ts`](backend/src/infrastructure/firestore/AssoRepository.ts) | Firestore implementation — transactions, Qonto verification, prod/demo namespacing |
| [`AssoPayoutRepository.ts`](backend/src/infrastructure/firestore/AssoPayoutRepository.ts) | Cursor-based pagination over a Firestore collectionGroup |

Use cases import `IAssoRepository`, not `AssoRepository`. The Firestore implementation is injected at the composition root (`app.ts`). This means:
- Use cases are testable with a mock repository
- Switching storage backend doesn't touch business logic

**Key pattern — Firestore transactions for concurrent writes:**
```typescript
// Contact mutation: read → compute (pure domain fn) → write, atomically
return docRef.firestore.runTransaction(async (tx) => {
  const snap    = await tx.get(docRef)
  const contacts = snap.data()[ASSO_OBJ_FIELD_CONTACTS]

  // Pure domain function — no side effects
  const result = upsertAssoContactInContacts({ contacts, event, normalizedContact })

  tx.update(docRef, { [ASSO_OBJ_FIELD_CONTACTS]: result.contacts })
  return result
})
```

---

### `application/` — Use Cases

Thin orchestration layer. Each use case has a single `execute()` method and delegates to a repository. They contain no Firestore imports.

| File | Responsibility |
|---|---|
| [`FetchAssoUseCase.ts`](backend/src/application/asso/FetchAssoUseCase.ts) | Read asso → return sanitized view |
| [`UpdateBankAccountUseCase.ts`](backend/src/application/asso/UpdateBankAccountUseCase.ts) | Validate input → delegate Qonto verification + Firestore write |
| [`ManageContactsUseCase.ts`](backend/src/application/asso/ManageContactsUseCase.ts) | Add / remove / patch contacts (delegates to repository transactions) |
| [`FetchPayoutsUseCase.ts`](backend/src/application/asso/FetchPayoutsUseCase.ts) | Paginated payout queries |
| [`FetchPromisesUseCase.ts`](backend/src/application/asso/FetchPromisesUseCase.ts) | Complex multi-collection query: merge paid + pending promises, enrich with donor identity and Stripe error details |

---

### `interface/http/` — REST API (Express)

Route handlers are thin adapters: parse → delegate to use case → respond. No business logic.

| File | What it shows |
|---|---|
| [`app.ts`](backend/src/interface/http/app.ts) | Composition root — wires repositories → use cases → routes |
| [`const.ts`](backend/src/interface/http/const.ts) | Route path constants — shared with the frontend to keep URLs in sync |
| [`routes/assoRoutes.ts`](backend/src/interface/http/routes/assoRoutes.ts) | GET asso, PUT bank-account, POST/DELETE/PATCH contacts |
| [`routes/payoutRoutes.ts`](backend/src/interface/http/routes/payoutRoutes.ts) | GET payouts, GET payout by ID, GET payout promises, GET promises |

**Key pattern — 405 catch-all on every path:**
```typescript
router.get(PATH_ASSO, handler)
router.all(PATH_ASSO, (_req, res) => methodNotAllowed(res, "GET"))
// Ensures the API never silently ignores wrong HTTP verbs
```

---

### `frontend/` — React Dashboard

The frontend is a Vite + React dashboard consumed by association administrators.

| File | Pattern |
|---|---|
| [`api.ts`](frontend/src/api.ts) | URL builders — imports path constants from backend, single source of truth |
| [`hooks/AssoProvider.tsx`](frontend/src/hooks/AssoProvider.tsx) | React Context — fetches asso once, provides assoId/isProd/asso to all children |
| [`hooks/useDonations.ts`](frontend/src/hooks/useDonations.ts) | Cursor-based infinite-scroll pagination (useRef for cursor to avoid re-renders) |
| [`hooks/useTransfers.ts`](frontend/src/hooks/useTransfers.ts) | useTransfers (list) + useTransfer (detail) + fetchPayoutPromises (imperative) |
| [`hooks/useContacts.ts`](frontend/src/hooks/useContacts.ts) | Mutation hooks (POST/DELETE/PATCH) + optimistic re-fetch after each write |
| [`hooks/useTaxReceipts.ts`](frontend/src/hooks/useTaxReceipts.ts) | Paginated tax receipt list with loadMore |

**Key pattern — shared constants between backend and frontend:**
```typescript
// frontend/src/api.ts
import { PATH_ASSO, PATH_PROMISES, API_VERSION } from "../../backend/src/interface/http/const"

// Frontend URL builders reference the same constants as the Express router.
// If a route path changes in the backend, TypeScript catches the mismatch.
```

---

## Production environment pattern

Every service function and repository method receives an `isProd: boolean` parameter. This threads through the entire stack to resolve the correct Firestore collection name:

```typescript
const ASSOS_COLL = (isProd: boolean) => isProd ? "Assos" : "AssosDemo"
```

Firebase Cloud Functions are exported in prod/demo pairs:
```typescript
export const api      = api_onReq(true)   // → https://api.tsedaclick.com
export const api_demo = api_onReq(false)  // → https://api-demo.tsedaclick.com
```

This allows running the full production flow against isolated demo data without any environment variable switching or config files.

---

## What this repo does NOT include

- Authentication / authorization (Firebase Auth + custom claims, handled upstream)
- Tax receipt PDF generation (Puppeteer, separate Cloud Function)
- Stripe webhooks and payment processing
- WhatsApp Business API (Twilio / Meta)
- Scheduled jobs (daily inspections, weekly payout planning)
- Frontend UI components (the hooks here connect to a Tailwind/React dashboard)
