import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HashChainService } from './hash-chain.service';
import { JournalEntry, Prisma } from '@prisma/client';

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashChain: HashChainService,
  ) {}

  async createEntry(data: {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<JournalEntry> {
    return this.prisma.$transaction(async (tx) => {
      // Fetch the last entry to chain the hash
      const lastEntry = await tx.journalEntry.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      const previousHash = lastEntry ? lastEntry.entryHash : null;

      // Calculate the entry hash
      const entryHash = this.hashChain.calculateHash({
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        userId: data.userId || null,
        metadata: data.metadata || null,
        previousHash,
      });

      // Write the entry using Prisma's DbNull if metadata is null
      const prismaMetadata =
        data.metadata === null || data.metadata === undefined
          ? Prisma.DbNull
          : (data.metadata as Prisma.InputJsonValue);

      return tx.journalEntry.create({
        data: {
          action: data.action,
          entityType: data.entityType,
          entityId: data.entityId,
          userId: data.userId || null,
          metadata: prismaMetadata,
          previousHash,
          entryHash,
        },
      });
    });
  }
}
