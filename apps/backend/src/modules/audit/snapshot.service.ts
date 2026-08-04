import { Injectable } from '@nestjs/common';
import { EntitySnapshot, Prisma } from '@prisma/client';

@Injectable()
export class SnapshotService {
  /**
   * Creates a versioned entity snapshot, closing any active older snapshots of the same entity.
   * Runs using the provided transaction client (tx).
   */
  async createSnapshot(
    tx: Prisma.TransactionClient,
    journalEntryId: string,
    entityType: string,
    entityId: string,
    state: Record<string, unknown>,
  ): Promise<EntitySnapshot> {
    const now = new Date();

    // 1. Find and close the currently active snapshot for this entity (if any)
    const activeSnapshot = await tx.entitySnapshot.findFirst({
      where: {
        entityType,
        entityId,
        isActive: true,
      },
    });

    let nextVersion = 1;

    if (activeSnapshot) {
      nextVersion = activeSnapshot.version + 1;

      // Close the previous active snapshot
      await tx.entitySnapshot.update({
        where: { id: activeSnapshot.id },
        data: {
          isActive: false,
          validTo: now,
        },
      });
    }

    // 2. Create the new active snapshot
    const prismaState = state as Prisma.InputJsonValue;

    return tx.entitySnapshot.create({
      data: {
        journalEntryId,
        entityType,
        entityId,
        state: prismaState,
        version: nextVersion,
        isActive: true,
        validFrom: now,
        validTo: null,
      },
    });
  }
}
