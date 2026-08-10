import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";

export interface WriteSnapshotInput {
  aggregateType: string;
  aggregateId: string;
  version: number;
  snapshotData: Prisma.InputJsonValue;
  validFrom: Date;
}

export interface ReconstructAsOfInput {
  aggregateType: string;
  aggregateId: string;
  asOf: Date;
}

export interface ListJournalEntriesInput {
  eventType?: string;
  aggregateType?: string;
  aggregateId?: string;
  actor?: string;
  from?: Date;
  to?: Date;
  limit: number;
}

export interface JournalEntryResult {
  id: string;
  sourceEventId: string | null;
  sequenceNumber: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  occurredAt: Date;
  previousHash: string | null;
  entryHash: string;
}

export interface ReconstructionResult {
  source: "snapshot" | "replay";
  aggregateType: string;
  aggregateId: string;
  asOf: Date;
  version: number | null;
  data: unknown;
}

export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async writeSnapshot(input: WriteSnapshotInput) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${input.aggregateType}:${input.aggregateId}`}))`;

      const current = await tx.entitySnapshot.findFirst({
        where: {
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          validTo: null,
        },
        orderBy: {
          version: "desc",
        },
      });

      if (current !== null) {
        await tx.entitySnapshot.update({
          where: {
            id: current.id,
          },
          data: {
            validTo: input.validFrom,
          },
        });
      }

      return tx.entitySnapshot.create({
        data: {
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          version: input.version,
          snapshotData: input.snapshotData,
          validFrom: input.validFrom,
          validTo: null,
        },
      });
    });
  }

  async listEntries(
    input: ListJournalEntriesInput,
  ): Promise<JournalEntryResult[]> {
    const matchingActors = input.actor
      ? await this.prisma.user.findMany({
          where: {
            email: {
              contains: input.actor.trim(),
              mode: "insensitive",
            },
          },
          select: { id: true },
        })
      : null;

    const entries = await this.prisma.journalEntry.findMany({
      where: {
        ...(input.eventType ? { eventType: input.eventType } : {}),
        ...(input.aggregateType
          ? { aggregateType: input.aggregateType }
          : {}),
        ...(input.aggregateId
          ? { aggregateId: input.aggregateId }
          : {}),
        ...(matchingActors
          ? {
              actorUserId: {
                in: matchingActors.map((user) => user.id),
              },
            }
          : {}),
        ...(input.from || input.to
          ? {
              occurredAt: {
                ...(input.from ? { gte: input.from } : {}),
                ...(input.to ? { lte: input.to } : {}),
              },
            }
          : {}),
      },
      orderBy: {
        sequenceNumber: "desc",
      },
      take: input.limit,
    });

    const actorIds = [
      ...new Set(
        entries
          .map((entry) => entry.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: actorIds },
          },
          select: {
            id: true,
            email: true,
          },
        })
      : [];

    const actorEmailById = new Map(
      actors.map((actor) => [actor.id, actor.email]),
    );

    return entries.map((entry) => ({
      id: entry.id,
      sourceEventId: entry.sourceEventId,
      sequenceNumber: entry.sequenceNumber.toString(),
      eventType: entry.eventType,
      aggregateType: entry.aggregateType,
      aggregateId: entry.aggregateId,
      payload: entry.payload,
      correlationId: entry.correlationId,
      actorUserId: entry.actorUserId,
      actorEmail: entry.actorUserId
        ? actorEmailById.get(entry.actorUserId) ?? null
        : null,
      occurredAt: entry.occurredAt,
      previousHash: entry.previousHash,
      entryHash: entry.entryHash,
    }));
  }

async reconstructAsOf(
    input: ReconstructAsOfInput,
  ): Promise<ReconstructionResult | null> {
    const snapshot = await this.prisma.entitySnapshot.findFirst({
      where: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        validFrom: {
          lte: input.asOf,
        },
        OR: [
          {
            validTo: null,
          },
          {
            validTo: {
              gt: input.asOf,
            },
          },
        ],
      },
      orderBy: {
        version: "desc",
      },
    });

    if (snapshot !== null) {
      return {
        source: "snapshot",
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        asOf: input.asOf,
        version: snapshot.version,
        data: snapshot.snapshotData,
      };
    }

    const hasSnapshots = await this.prisma.entitySnapshot.count({
      where: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
      },
    });

    if (hasSnapshots > 0) {
      return null;
    }

    const events = await this.prisma.journalEntry.findMany({
      where: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        occurredAt: {
          lte: input.asOf,
        },
      },
      orderBy: {
        sequenceNumber: "asc",
      },
    });

    if (events.length === 0) {
      return null;
    }

    let reconstructed: Record<string, unknown> = {};

    for (const event of events) {
      const payload = event.payload;

      if (
        payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
      ) {
        reconstructed = {
          ...reconstructed,
          ...(payload as Record<string, unknown>),
        };
      }
    }

    return {
      source: "replay",
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      asOf: input.asOf,
      version: null,
      data: reconstructed,
    };
  }
}
