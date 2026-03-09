/**
 * APPLICATION LAYER — UpdateBankAccountUseCase
 *
 * Updates the association's bank account after verifying the SEPA payee
 * against the Qonto banking API.
 *
 * The verification logic and Firestore write are encapsulated in the
 * repository. The use case coordinates the intent without knowing the "how".
 */

import type { IAssoRepository, SepaInput } from "../../infrastructure/firestore/IAssoRepository"

export class UpdateBankAccountUseCase {

  constructor(private readonly assoRepo: IAssoRepository) {}

  async execute(isProd: boolean, assoId: string, sepaInput: SepaInput) {
    if (!sepaInput.iban?.trim())             throw new Error('Missing or invalid "iban"')
    if (!sepaInput.beneficiary_name?.trim()) throw new Error('Missing or invalid "beneficiary_name"')

    return this.assoRepo.updateBankAccount(isProd, assoId, sepaInput)
  }
}
