import { Injectable } from '@nestjs/common';
import { JournalService } from './journal.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EntitySnapshot, JournalEntry, Prisma } from '@prisma/client';

/**
 * A virtual snapshot reconstructed by replaying journal entries.
 * Returned when no persisted EntitySnapshot covers the requested point in time.
 */
export interface ReconstructedState {
  entityType: string;
  entityId: string;
  state: Record<string, unknown>;
  version: number;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
  ) {}

  async log(
    action: string,
    entityType: string,
    entityId: string,
    userId?: string | null,
    metadata?: Record<string, unknown> | null,
  ) {
    return this.journalService.createEntry({
      action,
      entityType,
      entityId,
      userId,
      metadata,
    });
  }

  async reconstructAsOf(
    entityType: string,
    entityId: string,
    asOf: Date,
  ): Promise<EntitySnapshot | ReconstructedState | null> {
    // 1. Search EntitySnapshot valid as of the given date
    const snapshot = await this.prisma.entitySnapshot.findFirst({
      where: {
        entityType,
        entityId,
        validFrom: { lte: asOf },
        OR: [{ validTo: null }, { validTo: { gt: asOf } }],
      },
      orderBy: { version: 'desc' },
    });

    if (snapshot) {
      return snapshot;
    }

    // 2. If snapshot does not exist, replay JournalEntry events
    const entries = await this.prisma.journalEntry.findMany({
      where: {
        entityType,
        entityId,
        createdAt: { lte: asOf },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (entries.length === 0) {
      return null;
    }

    let state: Record<string, unknown> = {};
    for (const entry of entries) {
      if (
        entry.metadata &&
        typeof entry.metadata === 'object' &&
        !Array.isArray(entry.metadata)
      ) {
        state = { ...state, ...(entry.metadata as Record<string, unknown>) };
      }
    }

    return {
      entityType,
      entityId,
      state,
      version: entries.length,
    };
  }

  async queryJournal(filters: {
    actorUserId?: string;
    occurredAtStart?: Date;
    occurredAtEnd?: Date;
    aggregateType?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: JournalEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const {
      actorUserId,
      occurredAtStart,
      occurredAtEnd,
      aggregateType,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;
    const take = limit;

    const where: Prisma.JournalEntryWhereInput = {};

    if (actorUserId) {
      where.userId = actorUserId;
    }

    if (aggregateType) {
      where.entityType = aggregateType;
    }

    if (occurredAtStart || occurredAtEnd) {
      where.createdAt = {};
      if (occurredAtStart) {
        where.createdAt.gte = occurredAtStart;
      }
      if (occurredAtEnd) {
        where.createdAt.lte = occurredAtEnd;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
    };
  }
}
