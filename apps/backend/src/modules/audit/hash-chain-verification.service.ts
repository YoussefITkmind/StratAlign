import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HashChainService } from './hash-chain.service';
import { Prisma } from '@prisma/client';

export interface VerificationReport {
  isValid: boolean;
  totalVerified: number;
  error?: {
    type: 'TAMPERED_RECORD' | 'BROKEN_LINK';
    recordId: string;
    message: string;
    expectedHash?: string;
    actualHash?: string;
    expectedPreviousHash?: string;
    actualPreviousHash?: string;
  };
}

export interface VerificationJobData {
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class HashChainVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashChain: HashChainService,
    @InjectQueue('audit-verification-queue')
    private readonly verificationQueue: Queue,
  ) {}

  async triggerVerificationJob(data?: VerificationJobData): Promise<Job> {
    return this.verificationQueue.add('verify-chain', data || {});
  }

  async verifyCompleteChain(): Promise<VerificationReport> {
    return this.verifyRange();
  }

  async verifyRange(
    startDate?: Date,
    endDate?: Date,
  ): Promise<VerificationReport> {
    // 1. Resolve preceding record's entryHash to use as the initial expected previousHash
    let expectedPreviousHash: string | null = null;
    if (startDate) {
      const preceding = await this.prisma.journalEntry.findFirst({
        where: {
          createdAt: { lt: startDate },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (preceding) {
        expectedPreviousHash = preceding.entryHash;
      }
    }

    // 2. Fetch all records within the range
    const whereClause: Prisma.JournalEntryWhereInput = {};
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = startDate;
      }
      if (endDate) {
        whereClause.createdAt.lte = endDate;
      }
    }

    const records = await this.prisma.journalEntry.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let totalVerified = 0;

    for (const record of records) {
      // Parse metadata to match the shape expected by hash calculation
      const metadata = record.metadata
        ? (record.metadata as Record<string, unknown>)
        : null;

      // Verify previousHash link
      if (record.previousHash !== expectedPreviousHash) {
        return {
          isValid: false,
          totalVerified,
          error: {
            type: 'BROKEN_LINK',
            recordId: record.id,
            message: `Broken link detected at record ${record.id}. Expected previousHash: "${expectedPreviousHash || ''}", but got: "${record.previousHash || ''}".`,
            expectedPreviousHash: expectedPreviousHash || undefined,
            actualPreviousHash: record.previousHash || undefined,
          },
        };
      }

      // Verify entryHash calculation
      const computedHash = this.hashChain.calculateHash({
        action: record.action,
        entityType: record.entityType,
        entityId: record.entityId,
        userId: record.userId,
        metadata,
        previousHash: record.previousHash,
      });

      if (record.entryHash !== computedHash) {
        return {
          isValid: false,
          totalVerified,
          error: {
            type: 'TAMPERED_RECORD',
            recordId: record.id,
            message: `Tampered record detected at record ${record.id}. Expected entryHash: "${computedHash}", but got: "${record.entryHash}".`,
            expectedHash: computedHash,
            actualHash: record.entryHash,
          },
        };
      }

      expectedPreviousHash = record.entryHash;
      totalVerified++;
    }

    return {
      isValid: true,
      totalVerified,
    };
  }
}
