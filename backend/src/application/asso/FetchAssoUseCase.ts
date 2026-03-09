/**
 * APPLICATION LAYER — FetchAssoUseCase
 *
 * Retrieves the public view of an association.
 * The use case depends on IAssoRepository (an interface), not on Firestore.
 * This makes it independently testable.
 */

import type { IAssoRepository } from "../../infrastructure/firestore/IAssoRepository"
import type { AssoPublic }      from "../../domain/asso/AssoPublic"

export class FetchAssoUseCase {

  constructor(private readonly assoRepo: IAssoRepository) {}

  async execute(isProd: boolean, assoId: string): Promise<AssoPublic | null> {
    return this.assoRepo.findById(isProd, assoId)
  }
}
