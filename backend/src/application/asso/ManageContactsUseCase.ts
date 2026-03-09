/**
 * APPLICATION LAYER — ManageContactsUseCase
 *
 * Handles adding, removing, and patching notification contacts on an association.
 *
 * Contact management is intentionally denormalized: each association stores its
 * full contacts block as a nested object rather than a sub-collection. This
 * means all contact writes use Firestore transactions to prevent race conditions
 * when two dashboard users modify contacts simultaneously.
 *
 * Domain validation (email format, phone E.164, minAmount ≥ 0) is handled by
 * pure functions in AssoContact.ts — the repository only calls them and persists
 * the resulting state.
 */

import type { IAssoRepository, ContactPatch } from "../../infrastructure/firestore/IAssoRepository"
import type { AssoContactInput, AssoContactEvent, ContactMethod } from "../../domain/asso/AssoContact"

export class ManageContactsUseCase {

  constructor(private readonly assoRepo: IAssoRepository) {}

  add(isProd: boolean, assoId: string, input: AssoContactInput) {
    return this.assoRepo.addContact(isProd, assoId, input)
  }

  remove(
    isProd:  boolean,
    assoId:  string,
    params:  { event: AssoContactEvent; method: ContactMethod; destination: string },
  ) {
    return this.assoRepo.removeContact(isProd, assoId, params)
  }

  patch(
    isProd:  boolean,
    assoId:  string,
    params:  { event: AssoContactEvent; method: ContactMethod; destination: string; patch: ContactPatch },
  ) {
    return this.assoRepo.patchContact(isProd, assoId, params)
  }
}
