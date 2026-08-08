import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";

export interface AppendJournalEntryInput {
  sourceEventId?: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  correlationId?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedEntries: number;
  brokenSequenceNumber: bigint | null;
  brokenEntryId: string | null;
  reason: string | null;
}

interface HashableEntry {
  sourceEventId: string | null;
  sequenceNumber: bigint;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string | null;
  actorUserId: string | null;
  occurredAt: Date;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !(value instanceof Date)
  ) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }

  return value;
}

function serializeEntry(entry: HashableEntry): string {
  return JSON.stringify({
    sourceEventId: entry.sourceEventId,
    sequenceNumber: entry.sequenceNumber.toString(),
    eventType: entry.eventType,
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    payload: canonicalize(entry.payload),
    correlationId: entry.correlationId,
    actorUserId: entry.actorUserId,
    occurredAt: entry.occurredAt.toISOString(),
  });
}

function calculateEntryHash(
  previousHash: string | null,
  entry: HashableEntry,
): string {
  return createHash("sha256")
    .update(previousHash ?? "")
    .update(serializeEntry(entry))
    .digest("hex");
}

export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  async append(input: AppendJournalEntryInput) {
    return this.prisma.$transaction(async (tx) => {
      // Serialise journal appends across all worker instances.
      // The lock is automatically released when this transaction finishes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(742031)`;

if (input.sourceEventId) {
  const existing = await tx.journalEntry.findUnique({
    where: {
      sourceEventId: input.sourceEventId,
    },
  });

  if (existing) {
    return existing;
  }
}

      const previous = await tx.journalEntry.findFirst({
        orderBy: {
          sequenceNumber: "desc",
        },
        select: {
          sequenceNumber: true,
          entryHash: true,
        },
      });

      const sequenceNumber =
        previous === null
          ? 1n
          : previous.sequenceNumber + 1n;

      const hashableEntry: HashableEntry = {
        sourceEventId: input.sourceEventId ?? null,
        sequenceNumber,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        correlationId: input.correlationId ?? null,
        actorUserId: input.actorUserId ?? null,
        occurredAt: input.occurredAt,
      };

      const previousHash = previous?.entryHash ?? null;
      const entryHash = calculateEntryHash(
        previousHash,
        hashableEntry,
      );

      return tx.journalEntry.create({
        data: {
          sourceEventId: input.sourceEventId ?? null,
          sequenceNumber,
          eventType: input.eventType,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId,
          payload: input.payload,
          correlationId: input.correlationId ?? null,
          actorUserId: input.actorUserId ?? null,
          occurredAt: input.occurredAt,
          previousHash,
          entryHash,
        },
      });
    });
  }

  async verifyChain(): Promise<ChainVerificationResult> {
    const entries = await this.prisma.journalEntry.findMany({
      orderBy: {
        sequenceNumber: "asc",
      },
    });

    let expectedPreviousHash: string | null = null;
    let expectedSequenceNumber = 1n;

    for (const entry of entries) {
      if (entry.sequenceNumber !== expectedSequenceNumber) {
        return {
          valid: false,
          checkedEntries: Number(expectedSequenceNumber - 1n),
          brokenSequenceNumber: entry.sequenceNumber,
          brokenEntryId: entry.id,
          reason: `Expected sequence ${expectedSequenceNumber.toString()} but found ${entry.sequenceNumber.toString()}`,
        };
      }

      if (entry.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          checkedEntries: Number(entry.sequenceNumber - 1n),
          brokenSequenceNumber: entry.sequenceNumber,
          brokenEntryId: entry.id,
          reason: "previousHash does not match the preceding journal entry",
        };
      }

      const expectedEntryHash = calculateEntryHash(
        expectedPreviousHash,
        {
          sourceEventId: entry.sourceEventId,
          sequenceNumber: entry.sequenceNumber,
          eventType: entry.eventType,
          aggregateType: entry.aggregateType,
          aggregateId: entry.aggregateId,
          payload: entry.payload,
          correlationId: entry.correlationId,
          actorUserId: entry.actorUserId,
          occurredAt: entry.occurredAt,
        },
      );

      if (entry.entryHash !== expectedEntryHash) {
        return {
          valid: false,
          checkedEntries: Number(entry.sequenceNumber - 1n),
          brokenSequenceNumber: entry.sequenceNumber,
          brokenEntryId: entry.id,
          reason: "entryHash does not match the journal entry content",
        };
      }

      expectedPreviousHash = entry.entryHash;
      expectedSequenceNumber += 1n;
    }

    return {
      valid: true,
      checkedEntries: entries.length,
      brokenSequenceNumber: null,
      brokenEntryId: null,
      reason: null,
    };
  }
}
