/**
 * INFRASTRUCTURE LAYER — IAssoRepository interface
 *
 * Defines the contract between the application layer and the data store.
 * Use cases depend on this interface, not on the Firestore implementation.
 *
 * Benefits of this inversion:
 *  - Use cases are testable without a real database (inject a mock repository)
 *  - The storage backend can change (Firestore → PostgreSQL) without touching
 *    business logic
 *  - The boundary between "what" and "how" is explicit and enforced by TypeScript
 */

import type { AssoPublic }       from "../../domain/asso/AssoPublic"
import type {
  AssoContactInput,
  AssoContactEvent,
  ContactMethod,
} from "../../domain/asso/AssoContact"

// ─── Input types ──────────────────────────────────────────────────────────────

export type SepaInput = {
  iban:             string
  beneficiary_name: string
}

export type ContactPatch = {
  destination?:  string
  isEnabled?:    boolean
  displayName?:  string
  role?:         string
  locale?:       string
  minAmount?:    number
}

// ─── Repository interface ─────────────────────────────────────────────────────

export interface IAssoRepository {

  // ── Reads ──────────────────────────────────────────────────────────────────

  /** Returns the sanitized public view of an association, or null if not found */
  findById(isProd: boolean, assoId: string): Promise<AssoPublic | null>

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Verifies the SEPA payee against Qonto, then atomically persists both the
   * canonical BankAccount and the Qonto beneficiary snapshot.
   */
  updateBankAccount(
    isProd:    boolean,
    assoId:    string,
    sepaInput: SepaInput,
  ): Promise<{ bankAccount: unknown; qontoBeneficiary: unknown }>

  /**
   * Adds or merges a contact in an event's contact list.
   * The upsert logic is a pure domain function (see AssoContact.ts).
   * The repository runs it inside a Firestore transaction.
   */
  addContact(
    isProd: boolean,
    assoId: string,
    input:  AssoContactInput,
  ): Promise<{ added: boolean; merged: boolean; key: string; newCount: number }>

  /**
   * Removes a contact identified by (event, method, destination).
   * Runs inside a Firestore transaction.
   */
  removeContact(
    isProd: boolean,
    assoId: string,
    params: { event: AssoContactEvent; method: ContactMethod; destination: string },
  ): Promise<{ removed: boolean; key: string; newCount: number }>

  /**
   * Patches fields on an existing contact.
   * Re-validates the merged contact through the domain validation function.
   * Runs inside a Firestore transaction.
   */
  patchContact(
    isProd: boolean,
    assoId: string,
    params: { event: AssoContactEvent; method: ContactMethod; destination: string; patch: ContactPatch },
  ): Promise<{ oldKey: string; newKey: string; newCount: number }>

}
