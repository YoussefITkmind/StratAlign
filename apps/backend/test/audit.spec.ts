import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { setupTestEnvironment, TestEnvironment } from './db-test-helper';
import { HashChainService } from '../src/modules/audit/hash-chain.service';
import { JournalService } from '../src/modules/audit/journal.service';
import { SnapshotService } from '../src/modules/audit/snapshot.service';
import {
  AuditService,
  ReconstructedState,
} from '../src/modules/audit/audit.service';
import { EntitySnapshot } from '@prisma/client';
import { AuditEventListener } from '../src/modules/audit/audit-event.listener';
import { OutboxWorker } from '../src/modules/audit/workers/outbox.worker';
import {
  HashChainVerificationService,
  VerificationJobData,
  VerificationReport,
} from '../src/modules/audit/hash-chain-verification.service';
import { VerificationWorker } from '../src/modules/audit/workers/verification.worker';
import { ScheduleEventPayload } from '../src/modules/scheduler/events/schedule.events';
import { Job, Queue } from 'bullmq';
import { OutboxJobData } from '../src/modules/audit/workers/outbox.worker';
import { CadenceStatus, CadenceType } from '@prisma/client';
import { AuditController } from '../src/modules/audit/audit.controller';

describe('Audit Module - Phase 2, 3, 4 & 5', () => {
  let env: TestEnvironment;
  let hashChainService: HashChainService;
  let journalService: JournalService;
  let auditService: AuditService;
  let outboxWorker: OutboxWorker;
  let snapshotService: SnapshotService;
  let auditEventListener: AuditEventListener;
  let verificationService: HashChainVerificationService;
  let verificationWorker: VerificationWorker;

  const mockQueue = {
    add: vi.fn().mockImplementation((name: string, data: unknown) => {
      return { id: 'mock-job-id', name, data };
    }),
  } as unknown as Queue;

  beforeAll(async () => {
    env = await setupTestEnvironment();
    hashChainService = new HashChainService();
    journalService = new JournalService(env.prisma, hashChainService);
    auditService = new AuditService(env.prisma, journalService);
    snapshotService = new SnapshotService();
    auditEventListener = new AuditEventListener(
      env.prisma,
      journalService,
      snapshotService,
    );
    outboxWorker = new OutboxWorker(journalService);
    verificationService = new HashChainVerificationService(
      env.prisma,
      hashChainService,
      mockQueue,
    );
    verificationWorker = new VerificationWorker(verificationService);
  });

  afterAll(async () => {
    await env.cleanup();
  });

  describe('HashChainService', () => {
    it('should generate a deterministic SHA256 hash', () => {
      const entry = {
        action: 'CREATE',
        entityType: 'User',
        entityId: 'user-123',
        userId: 'actor-456',
        metadata: { role: 'admin' },
        previousHash: null,
      };

      const hash1 = hashChainService.calculateHash(entry);
      const hash2 = hashChainService.calculateHash(entry);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 hex length
    });

    it('should change hash if previousHash changes', () => {
      const entry1 = {
        action: 'CREATE',
        entityType: 'User',
        entityId: 'user-123',
        userId: 'actor-456',
        metadata: { role: 'admin' },
        previousHash: 'hash-abc',
      };

      const entry2 = {
        ...entry1,
        previousHash: 'hash-xyz',
      };

      const hash1 = hashChainService.calculateHash(entry1);
      const hash2 = hashChainService.calculateHash(entry2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('JournalService', () => {
    it('should write immutable journal entries and chain hashes correctly', async () => {
      // 1. Create first entry (Genesis)
      const entry1 = await journalService.createEntry({
        action: 'CREATE_DEFINITION',
        entityType: 'CadenceDefinition',
        entityId: 'def-1',
        userId: 'user-1',
        metadata: { name: 'Monthly Def' },
      });

      expect(entry1.previousHash).toBeNull();
      expect(entry1.entryHash).toBeDefined();
      expect(entry1.entryHash).toHaveLength(64);

      // 2. Create second entry
      const entry2 = await journalService.createEntry({
        action: 'UPDATE_DEFINITION',
        entityType: 'CadenceDefinition',
        entityId: 'def-1',
        userId: 'user-1',
        metadata: { name: 'Updated Monthly Def' },
      });

      expect(entry2.previousHash).toBe(entry1.entryHash);
      expect(entry2.entryHash).toBeDefined();
      expect(entry2.entryHash).toHaveLength(64);
      expect(entry2.entryHash).not.toBe(entry1.entryHash);

      // 3. Create third entry
      const entry3 = await journalService.createEntry({
        action: 'DELETE_DEFINITION',
        entityType: 'CadenceDefinition',
        entityId: 'def-1',
        userId: 'user-2',
      });

      expect(entry3.previousHash).toBe(entry2.entryHash);
      expect(entry3.entryHash).toBeDefined();
      expect(entry3.entryHash).toHaveLength(64);
    });
  });

  describe('OutboxWorker', () => {
    it('should consume a generic outbox event job and save it to the journal', async () => {
      const mockJob = {
        id: 'job-1',
        name: 'log-event',
        data: {
          action: 'QUEUE_NOTIFICATION',
          entityType: 'NotificationDelivery',
          entityId: 'delivery-789',
          userId: 'user-999',
          metadata: { template: 'review-due' },
        },
      } as unknown as Job<OutboxJobData, void, string>;

      // Assert that there's a certain number of entries before
      const countBefore = await env.prisma.journalEntry.count();

      // Process job
      await outboxWorker.process(mockJob);

      // Assert that an entry was added
      const entries = await env.prisma.journalEntry.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      expect(entries).toHaveLength(1);
      const countAfter = await env.prisma.journalEntry.count();
      expect(countAfter).toBe(countBefore + 1);

      const latestEntry = entries[0];
      expect(latestEntry.action).toBe('QUEUE_NOTIFICATION');
      expect(latestEntry.entityType).toBe('NotificationDelivery');
      expect(latestEntry.entityId).toBe('delivery-789');
      expect(latestEntry.userId).toBe('user-999');
      expect(latestEntry.metadata).toEqual({ template: 'review-due' });
      expect(latestEntry.entryHash).toBeDefined();
    });
  });

  describe('HashChainVerificationService & VerificationWorker', () => {
    beforeEach(() => {
      // restoreMocks (vitest.config.ts) wipes mockQueue.add's implementation
      // between tests, since it's only set once at module scope.
      vi.mocked(mockQueue.add).mockImplementation(
        (name: string, data: unknown) => {
          return { id: 'mock-job-id', name, data } as unknown as ReturnType<
            Queue['add']
          >;
        },
      );
    });

    it('should verify a complete valid chain', async () => {
      // Clear database journal entries for deterministic verification
      await env.prisma.journalEntry.deleteMany({});

      // Create sequence of entries
      await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
      });
      await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeA',
        entityId: 'id-2',
      });
      await journalService.createEntry({
        action: 'ACTION_3',
        entityType: 'TypeA',
        entityId: 'id-3',
      });

      const report = await verificationService.verifyCompleteChain();
      expect(report.isValid).toBe(true);
      expect(report.totalVerified).toBe(3);
      expect(report.error).toBeUndefined();
    });

    it('should detect a tampered record and identify the exact entry ID', async () => {
      // Find the last record
      const lastRecord = await env.prisma.journalEntry.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      expect(lastRecord).toBeDefined();
      const targetId = lastRecord!.id;

      // Tamper with the database record directly
      await env.prisma.journalEntry.update({
        where: { id: targetId },
        data: {
          action: 'TAMPERED_ACTION', // Changes calculated hash
        },
      });

      const report = await verificationService.verifyCompleteChain();
      expect(report.isValid).toBe(false);
      expect(report.error?.type).toBe('TAMPERED_RECORD');
      expect(report.error?.recordId).toBe(targetId);
      expect(report.error?.message).toContain('Tampered record detected');
    });

    it('should detect a broken link where previousHash is modified', async () => {
      await env.prisma.journalEntry.deleteMany({});

      await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
      });
      const e2 = await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeB',
        entityId: 'id-2',
      });

      // Modify previousHash of second entry
      await env.prisma.journalEntry.update({
        where: { id: e2.id },
        data: {
          previousHash: 'invalid-previous-hash-value',
        },
      });

      const report = await verificationService.verifyCompleteChain();
      expect(report.isValid).toBe(false);
      expect(report.error?.type).toBe('BROKEN_LINK');
      expect(report.error?.recordId).toBe(e2.id);
      expect(report.error?.message).toContain('Broken link detected');
    });

    it('should verify a range of entries anchoring preceding records correctly', async () => {
      await env.prisma.journalEntry.deleteMany({});

      const now = Date.now();

      // Create entries spaced in time
      await env.prisma.journalEntry.create({
        data: {
          action: 'ACTION_1',
          entityType: 'TypeA',
          entityId: 'id-1',
          createdAt: new Date(now - 10000),
          entryHash: 'dummy-hash-1',
        },
      });

      const e2 = await env.prisma.journalEntry.create({
        data: {
          action: 'ACTION_2',
          entityType: 'TypeA',
          entityId: 'id-2',
          previousHash: 'dummy-hash-1',
          createdAt: new Date(now - 5000),
          entryHash: hashChainService.calculateHash({
            action: 'ACTION_2',
            entityType: 'TypeA',
            entityId: 'id-2',
            userId: null,
            metadata: null,
            previousHash: 'dummy-hash-1',
          }),
        },
      });

      await env.prisma.journalEntry.create({
        data: {
          action: 'ACTION_3',
          entityType: 'TypeA',
          entityId: 'id-3',
          previousHash: e2.entryHash,
          createdAt: new Date(now),
          entryHash: hashChainService.calculateHash({
            action: 'ACTION_3',
            entityType: 'TypeA',
            entityId: 'id-3',
            userId: null,
            metadata: null,
            previousHash: e2.entryHash,
          }),
        },
      });

      // Verify range from now - 6000ms onwards (should include e2 and e3)
      const report = await verificationService.verifyRange(
        new Date(now - 6000),
        new Date(now + 1000),
      );
      expect(report.isValid).toBe(true);
      expect(report.totalVerified).toBe(2);
    });

    it('should support manual trigger by adding job to Queue', async () => {
      const mockParams: VerificationJobData = {
        startDate: new Date().toISOString(),
      };
      const job = await verificationService.triggerVerificationJob(mockParams);
      expect(vi.mocked(mockQueue.add)).toHaveBeenCalledWith(
        'verify-chain',
        mockParams,
      );
      expect(job.id).toBe('mock-job-id');
    });

    it('should execute successfully via VerificationWorker', async () => {
      await env.prisma.journalEntry.deleteMany({});
      await journalService.createEntry({
        action: 'VERIFIED_ACTION',
        entityType: 'TypeZ',
        entityId: 'id-z',
      });

      const mockJob = {
        id: 'job-verify-1',
        name: 'verify-chain',
        data: {},
      } as unknown as Job<VerificationJobData, VerificationReport, string>;

      const report = await verificationWorker.process(mockJob);
      expect(report.isValid).toBe(true);
      expect(report.totalVerified).toBe(1);
    });
  });

  describe('SnapshotService - Phase 4', () => {
    it('should create an initial snapshot with version 1', async () => {
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});

      // Create a journal entry to anchor the snapshot
      const entry = await journalService.createEntry({
        action: 'CREATE_ENTITY',
        entityType: 'CadenceDefinition',
        entityId: 'def-snap-1',
      });

      const snapshot = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entry.id,
          'CadenceDefinition',
          'def-snap-1',
          { name: 'Monthly Review', cadenceType: 'MONTHLY' },
        );
      });

      expect(snapshot.version).toBe(1);
      expect(snapshot.isActive).toBe(true);
      expect(snapshot.validFrom).toBeDefined();
      expect(snapshot.validTo).toBeNull();
      expect(snapshot.entityType).toBe('CadenceDefinition');
      expect(snapshot.entityId).toBe('def-snap-1');
      expect(snapshot.state).toEqual({
        name: 'Monthly Review',
        cadenceType: 'MONTHLY',
      });
    });

    it('should increment version and close previous snapshot', async () => {
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});

      // Create first journal entry and snapshot
      const entry1 = await journalService.createEntry({
        action: 'CREATE_ENTITY',
        entityType: 'CadenceDefinition',
        entityId: 'def-snap-2',
      });

      const snap1 = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entry1.id,
          'CadenceDefinition',
          'def-snap-2',
          { name: 'Original Name' },
        );
      });

      expect(snap1.version).toBe(1);
      expect(snap1.isActive).toBe(true);
      expect(snap1.validTo).toBeNull();

      // Create second journal entry and snapshot for the same entity
      const entry2 = await journalService.createEntry({
        action: 'UPDATE_ENTITY',
        entityType: 'CadenceDefinition',
        entityId: 'def-snap-2',
      });

      const snap2 = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entry2.id,
          'CadenceDefinition',
          'def-snap-2',
          { name: 'Updated Name' },
        );
      });

      // New snapshot should be version 2 and active
      expect(snap2.version).toBe(2);
      expect(snap2.isActive).toBe(true);
      expect(snap2.validTo).toBeNull();
      expect(snap2.state).toEqual({ name: 'Updated Name' });

      // Old snapshot should now be closed
      const closedSnap = await env.prisma.entitySnapshot.findUnique({
        where: { id: snap1.id },
      });

      expect(closedSnap).toBeDefined();
      expect(closedSnap!.isActive).toBe(false);
      expect(closedSnap!.validTo).not.toBeNull();
    });

    it('should handle multiple entities independently', async () => {
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});

      // Snapshot for entity A
      const entryA = await journalService.createEntry({
        action: 'CREATE_ENTITY',
        entityType: 'CadenceDefinition',
        entityId: 'entity-A',
      });

      const snapA = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entryA.id,
          'CadenceDefinition',
          'entity-A',
          { name: 'Entity A' },
        );
      });

      // Snapshot for entity B
      const entryB = await journalService.createEntry({
        action: 'CREATE_ENTITY',
        entityType: 'CadenceInstance',
        entityId: 'entity-B',
      });

      const snapB = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entryB.id,
          'CadenceInstance',
          'entity-B',
          { status: 'PENDING' },
        );
      });

      // Both should be version 1 and active independently
      expect(snapA.version).toBe(1);
      expect(snapA.isActive).toBe(true);
      expect(snapB.version).toBe(1);
      expect(snapB.isActive).toBe(true);

      // Now update entity A — entity B should remain untouched
      const entryA2 = await journalService.createEntry({
        action: 'UPDATE_ENTITY',
        entityType: 'CadenceDefinition',
        entityId: 'entity-A',
      });

      const snapA2 = await env.prisma.$transaction(async (tx) => {
        return snapshotService.createSnapshot(
          tx,
          entryA2.id,
          'CadenceDefinition',
          'entity-A',
          { name: 'Entity A v2' },
        );
      });

      expect(snapA2.version).toBe(2);
      expect(snapA2.isActive).toBe(true);

      // Entity B should still be version 1 and active
      const snapBCheck = await env.prisma.entitySnapshot.findUnique({
        where: { id: snapB.id },
      });
      expect(snapBCheck!.version).toBe(1);
      expect(snapBCheck!.isActive).toBe(true);
      expect(snapBCheck!.validTo).toBeNull();
    });
  });

  describe('AuditEventListener - Phase 5', () => {
    it('should create a journal entry and snapshot when handling a schedule event', async () => {
      // Clean up
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});

      // Create test data: CadenceDefinition + CadenceInstance
      const definition = await env.prisma.cadenceDefinition.create({
        data: {
          name: 'Audit Test Cadence',
          cadenceType: CadenceType.MONTHLY,
          dayOffset: 5,
          warningLeadDays: 3,
        },
      });

      const now = new Date();
      const instance = await env.prisma.cadenceInstance.create({
        data: {
          cadenceDefinitionId: definition.id,
          periodRef: '2026-01',
          dueAt: now,
          openedAt: now,
          closingAt: now,
          closedAt: now,
          status: CadenceStatus.OPEN,
        },
      });

      // Fire the listener handler directly
      const event = new ScheduleEventPayload(
        instance.id,
        definition.id,
        '2026-01',
        now,
      );

      await auditEventListener.handleWindowOpened(event);

      // Verify journal entry was created
      const entries = await env.prisma.journalEntry.findMany({
        where: { entityId: instance.id },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('WINDOW_OPENED');
      expect(entries[0].entityType).toBe('CadenceInstance');
      expect(entries[0].entityId).toBe(instance.id);

      // Verify snapshot was created
      const snapshots = await env.prisma.entitySnapshot.findMany({
        where: { entityId: instance.id },
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].entityType).toBe('CadenceInstance');
      expect(snapshots[0].version).toBe(1);
      expect(snapshots[0].isActive).toBe(true);
      expect(snapshots[0].journalEntryId).toBe(entries[0].id);

      // Clean up test data
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});
      await env.prisma.cadenceInstance.deleteMany({});
      await env.prisma.cadenceDefinition.deleteMany({});
    });

    it('should create a hash chain and incrementing snapshot versions across multiple events', async () => {
      // Clean up
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});

      // Create test data
      const definition = await env.prisma.cadenceDefinition.create({
        data: {
          name: 'Multi-Event Cadence',
          cadenceType: CadenceType.QUARTERLY,
          dayOffset: 10,
          warningLeadDays: 5,
        },
      });

      const now = new Date();
      const instance = await env.prisma.cadenceInstance.create({
        data: {
          cadenceDefinitionId: definition.id,
          periodRef: '2026-Q1',
          dueAt: now,
          openedAt: now,
          closingAt: now,
          closedAt: now,
          status: CadenceStatus.PENDING,
        },
      });

      const event = new ScheduleEventPayload(
        instance.id,
        definition.id,
        '2026-Q1',
        now,
      );

      // Simulate lifecycle: OPENED -> REVIEW_DUE -> CLOSING -> CLOSED
      // Update instance status before each event for realistic snapshots
      await env.prisma.cadenceInstance.update({
        where: { id: instance.id },
        data: { status: CadenceStatus.OPEN },
      });
      await auditEventListener.handleWindowOpened(event);

      await auditEventListener.handleReviewDue(event);

      await env.prisma.cadenceInstance.update({
        where: { id: instance.id },
        data: { status: CadenceStatus.CLOSING },
      });
      await auditEventListener.handleWindowClosing(event);

      await env.prisma.cadenceInstance.update({
        where: { id: instance.id },
        data: { status: CadenceStatus.CLOSED },
      });
      await auditEventListener.handleWindowClosed(event);

      // Verify 4 journal entries in hash chain
      const entries = await env.prisma.journalEntry.findMany({
        where: { entityId: instance.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(entries).toHaveLength(4);
      expect(entries[0].action).toBe('WINDOW_OPENED');
      expect(entries[1].action).toBe('REVIEW_DUE');
      expect(entries[2].action).toBe('WINDOW_CLOSING');
      expect(entries[3].action).toBe('WINDOW_CLOSED');

      // Verify hash chain linkage
      expect(entries[0].previousHash).toBeNull();
      expect(entries[1].previousHash).toBe(entries[0].entryHash);
      expect(entries[2].previousHash).toBe(entries[1].entryHash);
      expect(entries[3].previousHash).toBe(entries[2].entryHash);

      // Verify 4 snapshots, only the last is active
      const snapshots = await env.prisma.entitySnapshot.findMany({
        where: { entityId: instance.id },
        orderBy: { version: 'asc' },
      });
      expect(snapshots).toHaveLength(4);
      expect(snapshots[0].version).toBe(1);
      expect(snapshots[0].isActive).toBe(false);
      expect(snapshots[1].version).toBe(2);
      expect(snapshots[1].isActive).toBe(false);
      expect(snapshots[2].version).toBe(3);
      expect(snapshots[2].isActive).toBe(false);
      expect(snapshots[3].version).toBe(4);
      expect(snapshots[3].isActive).toBe(true);
      expect(snapshots[3].validTo).toBeNull();

      // Clean up test data
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});
      await env.prisma.cadenceInstance.deleteMany({});
      await env.prisma.cadenceDefinition.deleteMany({});
    });
  });

  describe('AuditService.reconstructAsOf - Phase 5', () => {
    beforeEach(async () => {
      await env.prisma.entitySnapshot.deleteMany({});
      await env.prisma.journalEntry.deleteMany({});
    });

    it('should return snapshot if found within validity interval', async () => {
      const now = new Date();
      const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);

      // Create journal entries to link the snapshots
      const entry1 = await journalService.createEntry({
        action: 'CREATE',
        entityType: 'CadenceInstance',
        entityId: 'reconstruct-inst-1',
        metadata: { status: 'PENDING' },
      });

      const entry2 = await journalService.createEntry({
        action: 'UPDATE',
        entityType: 'CadenceInstance',
        entityId: 'reconstruct-inst-1',
        metadata: { status: 'OPEN' },
      });

      // Create snapshot 1 valid from 10 mins ago to 5 mins ago
      const snap1 = await env.prisma.entitySnapshot.create({
        data: {
          journalEntryId: entry1.id,
          entityType: 'CadenceInstance',
          entityId: 'reconstruct-inst-1',
          state: { status: 'PENDING', name: 'Original' },
          version: 1,
          isActive: false,
          validFrom: tenMinsAgo,
          validTo: fiveMinsAgo,
        },
      });

      // Create snapshot 2 valid from 5 mins ago to null (currently active)
      const snap2 = await env.prisma.entitySnapshot.create({
        data: {
          journalEntryId: entry2.id,
          entityType: 'CadenceInstance',
          entityId: 'reconstruct-inst-1',
          state: { status: 'OPEN', name: 'Original' },
          version: 2,
          isActive: true,
          validFrom: fiveMinsAgo,
          validTo: null,
        },
      });

      // Query as of 7 minutes ago (should return snap1)
      const result1 = await auditService.reconstructAsOf(
        'CadenceInstance',
        'reconstruct-inst-1',
        new Date(now.getTime() - 7 * 60 * 1000),
      );
      expect(result1).not.toBeNull();
      expect(result1!.id).toBe(snap1.id);
      expect((result1 as EntitySnapshot).state).toEqual({
        status: 'PENDING',
        name: 'Original',
      });

      // Query as of 2 minutes ago (should return snap2)
      const result2 = await auditService.reconstructAsOf(
        'CadenceInstance',
        'reconstruct-inst-1',
        new Date(now.getTime() - 2 * 60 * 1000),
      );
      expect(result2).not.toBeNull();
      expect(result2!.id).toBe(snap2.id);
      expect((result2 as EntitySnapshot).state).toEqual({
        status: 'OPEN',
        name: 'Original',
      });
    });

    it('should replay journal entries if no snapshot exists', async () => {
      const now = new Date();
      const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);
      const twoMinsAgo = new Date(now.getTime() - 2 * 60 * 1000);

      // Create three journal entries
      const e1 = await journalService.createEntry({
        action: 'CREATE',
        entityType: 'CadenceInstance',
        entityId: 'reconstruct-inst-2',
        metadata: { status: 'PENDING', createdBy: 'admin' },
      });
      // Force createdAt timestamps
      await env.prisma.journalEntry.update({
        where: { id: e1.id },
        data: { createdAt: tenMinsAgo },
      });

      const e2 = await journalService.createEntry({
        action: 'UPDATE',
        entityType: 'CadenceInstance',
        entityId: 'reconstruct-inst-2',
        metadata: { status: 'OPEN', description: 'Window is open' },
      });
      await env.prisma.journalEntry.update({
        where: { id: e2.id },
        data: { createdAt: fiveMinsAgo },
      });

      const e3 = await journalService.createEntry({
        action: 'UPDATE',
        entityType: 'CadenceInstance',
        entityId: 'reconstruct-inst-2',
        metadata: { status: 'CLOSED' },
      });
      await env.prisma.journalEntry.update({
        where: { id: e3.id },
        data: { createdAt: twoMinsAgo },
      });

      // 1. Query as of 7 minutes ago: should only replay e1
      const res1 = await auditService.reconstructAsOf(
        'CadenceInstance',
        'reconstruct-inst-2',
        new Date(now.getTime() - 7 * 60 * 1000),
      );
      expect(res1).not.toBeNull();
      expect(res1!.id).toBeUndefined(); // Virtual snapshot
      expect((res1 as ReconstructedState).state).toEqual({
        status: 'PENDING',
        createdBy: 'admin',
      });
      expect((res1 as ReconstructedState).version).toBe(1);

      // 2. Query as of 3 minutes ago: should replay e1 and e2
      const res2 = await auditService.reconstructAsOf(
        'CadenceInstance',
        'reconstruct-inst-2',
        new Date(now.getTime() - 3 * 60 * 1000),
      );
      expect(res2).not.toBeNull();
      expect((res2 as ReconstructedState).state).toEqual({
        status: 'OPEN',
        createdBy: 'admin',
        description: 'Window is open',
      });
      expect((res2 as ReconstructedState).version).toBe(2);

      // 3. Query as of now: should replay e1, e2, and e3
      const res3 = await auditService.reconstructAsOf(
        'CadenceInstance',
        'reconstruct-inst-2',
        now,
      );
      expect(res3).not.toBeNull();
      expect((res3 as ReconstructedState).state).toEqual({
        status: 'CLOSED',
        createdBy: 'admin',
        description: 'Window is open',
      });
      expect((res3 as ReconstructedState).version).toBe(3);
    });

    it('should return null if no snapshot and no journal entries exist', async () => {
      const result = await auditService.reconstructAsOf(
        'CadenceInstance',
        'non-existent-instance',
        new Date(),
      );
      expect(result).toBeNull();
    });
  });

  describe('AuditService.queryJournal', () => {
    beforeEach(async () => {
      await env.prisma.journalEntry.deleteMany({});
    });

    it('should return all journal entries when no filters are applied', async () => {
      await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
        userId: 'user-1',
      });
      await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeB',
        entityId: 'id-2',
        userId: 'user-2',
      });

      const result = await auditService.queryJournal({});
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by actorUserId', async () => {
      await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
        userId: 'user-1',
      });
      await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeB',
        entityId: 'id-2',
        userId: 'user-2',
      });

      const result = await auditService.queryJournal({ actorUserId: 'user-1' });
      expect(result.total).toBe(1);
      expect(result.data[0].userId).toBe('user-1');
    });

    it('should filter by aggregateType (entityType)', async () => {
      await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
      });
      await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeB',
        entityId: 'id-2',
      });

      const result = await auditService.queryJournal({
        aggregateType: 'TypeB',
      });
      expect(result.total).toBe(1);
      expect(result.data[0].entityType).toBe('TypeB');
    });

    it('should filter by occurredAt (createdAt) range', async () => {
      const now = new Date();
      const tenMinsAgo = new Date(now.getTime() - 10 * 60 * 1000);
      const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000);

      const e1 = await journalService.createEntry({
        action: 'ACTION_1',
        entityType: 'TypeA',
        entityId: 'id-1',
      });
      await env.prisma.journalEntry.update({
        where: { id: e1.id },
        data: { createdAt: tenMinsAgo },
      });

      const e2 = await journalService.createEntry({
        action: 'ACTION_2',
        entityType: 'TypeB',
        entityId: 'id-2',
      });
      await env.prisma.journalEntry.update({
        where: { id: e2.id },
        data: { createdAt: fiveMinsAgo },
      });

      const result = await auditService.queryJournal({
        occurredAtStart: new Date(now.getTime() - 8 * 60 * 1000),
        occurredAtEnd: new Date(now.getTime() - 2 * 60 * 1000),
      });

      expect(result.total).toBe(1);
      expect(result.data[0].id).toBe(e2.id);
    });

    it('should apply pagination offset and limit correctly', async () => {
      // Create 5 entries
      for (let i = 1; i <= 5; i++) {
        await journalService.createEntry({
          action: `ACTION_${i}`,
          entityType: 'TypeA',
          entityId: `id-${i}`,
        });
      }

      const result = await auditService.queryJournal({ page: 2, limit: 2 });
      expect(result.total).toBe(5);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(2);
    });
  });

  describe('AuditController', () => {
    let controller: AuditController;

    beforeAll(() => {
      controller = new AuditController(auditService);
    });

    it('should call auditService.queryJournal with correctly parsed parameters', async () => {
      const queryJournalSpy = vi
        .spyOn(auditService, 'queryJournal')
        .mockResolvedValue({
          data: [],
          total: 0,
          page: 1,
          limit: 10,
        });

      await controller.getJournal(
        'user-123',
        '2026-08-01T00:00:00.000Z',
        '2026-08-02T00:00:00.000Z',
        'CadenceInstance',
        '2',
        '10',
      );

      expect(queryJournalSpy).toHaveBeenCalledWith({
        actorUserId: 'user-123',
        occurredAtStart: new Date('2026-08-01T00:00:00.000Z'),
        occurredAtEnd: new Date('2026-08-02T00:00:00.000Z'),
        aggregateType: 'CadenceInstance',
        page: 2,
        limit: 10,
      });

      queryJournalSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 6 – WithAuditTapMiddleware (pure-unit, no DB required)
// ---------------------------------------------------------------------------

import {
  isAuditRelevant,
  WithAuditTapMiddleware,
  AUDIT_TAP_EVENT,
  AuditTapMeta,
} from '../src/common/middleware/with-audit-tap.middleware';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';

describe('WithAuditTapMiddleware - Phase 6', () => {
  // ── helpers ────────────────────────────────────────────────────────────────

  /** Build a minimal mock Express Request */
  function makeReq(
    method: string,
    path = '/test',
    auditMeta?: AuditTapMeta,
  ): Request {
    return {
      method,
      path,
      auditMeta,
    } as unknown as Request;
  }

  /**
   * Build a minimal mock Express Response that is also an EventEmitter so we
   * can emit 'finish' in tests.
   */
  function makeRes(statusCode = 200): Response & EventEmitter {
    const emitter = new EventEmitter();
    return Object.assign(emitter, { statusCode }) as unknown as Response &
      EventEmitter;
  }

  // ── isAuditRelevant ────────────────────────────────────────────────────────

  describe('isAuditRelevant()', () => {
    it('should return true for mutation methods by default', () => {
      expect(isAuditRelevant('POST')).toBe(true);
      expect(isAuditRelevant('PUT')).toBe(true);
      expect(isAuditRelevant('PATCH')).toBe(true);
      expect(isAuditRelevant('DELETE')).toBe(true);
    });

    it('should return false for query methods by default', () => {
      expect(isAuditRelevant('GET')).toBe(false);
      expect(isAuditRelevant('HEAD')).toBe(false);
    });

    it('should respect meta.auditRelevant = true on a GET', () => {
      expect(isAuditRelevant('GET', { auditRelevant: true })).toBe(true);
    });

    it('should respect meta.auditRelevant = false on a POST', () => {
      expect(isAuditRelevant('POST', { auditRelevant: false })).toBe(false);
    });

    it('should be case-insensitive for method strings', () => {
      expect(isAuditRelevant('post')).toBe(true);
      expect(isAuditRelevant('get')).toBe(false);
    });
  });

  // ── WithAuditTapMiddleware ─────────────────────────────────────────────────

  describe('WithAuditTapMiddleware.use()', () => {
    let mockOutboxQueue: Queue;
    let middleware: WithAuditTapMiddleware;

    beforeEach(() => {
      mockOutboxQueue = {
        add: vi.fn().mockResolvedValue({ id: 'queued-job-id' }),
      } as unknown as Queue;

      middleware = new WithAuditTapMiddleware(mockOutboxQueue);
    });

    it('should enqueue spm.api.call.completed after a mutation finishes', async () => {
      const req = makeReq('POST', '/scheduler/cadence');
      const res = makeRes(201);
      const next = vi.fn();

      middleware.use(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      // Simulate Express calling 'finish' after the response is sent
      res.emit('finish');

      // Allow the microtask queue to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(vi.mocked(mockOutboxQueue.add)).toHaveBeenCalledOnce();
      const firstCall = vi.mocked(mockOutboxQueue.add).mock.calls[0];
      const jobName = firstCall[0];
      const jobData = firstCall[1] as Record<string, string>;
      expect(jobName).toBe('log-event');
      expect(jobData.action).toBe(AUDIT_TAP_EVENT);
      expect(jobData.entityType).toBe('ApiCall');
      expect(jobData.entityId).toBe('POST:/scheduler/cadence');
    });

    it('should NOT enqueue for a GET by default', async () => {
      const req = makeReq('GET', '/scheduler/instances/upcoming');
      const res = makeRes(200);
      const next = vi.fn();

      middleware.use(req, res, next);
      res.emit('finish');
      await new Promise((r) => setTimeout(r, 0));

      expect(vi.mocked(mockOutboxQueue.add)).not.toHaveBeenCalled();
    });

    it('should enqueue for a GET when meta.auditRelevant = true', async () => {
      const req = makeReq('GET', '/audit/report', { auditRelevant: true });
      const res = makeRes(200);
      const next = vi.fn();

      middleware.use(req, res, next);
      res.emit('finish');
      await new Promise((r) => setTimeout(r, 0));

      expect(vi.mocked(mockOutboxQueue.add)).toHaveBeenCalledOnce();
    });

    it('should NOT enqueue for a DELETE when meta.auditRelevant = false', async () => {
      const req = makeReq('DELETE', '/internal/cache', {
        auditRelevant: false,
      });
      const res = makeRes(204);
      const next = vi.fn();

      middleware.use(req, res, next);
      res.emit('finish');
      await new Promise((r) => setTimeout(r, 0));

      expect(vi.mocked(mockOutboxQueue.add)).not.toHaveBeenCalled();
    });

    it('should always call next()', () => {
      const req = makeReq('POST', '/anything');
      const res = makeRes(200);
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 7 – SIEM Abstraction
// ---------------------------------------------------------------------------

import { ConsoleSIEMSender } from '../src/modules/audit/siem/console-siem-sender';
import { SIEMClassification } from '../src/modules/audit/siem/siem-sender.interface';
import { Logger } from '@nestjs/common';

describe('ConsoleSIEMSender - Phase 7', () => {
  let siemSender: ConsoleSIEMSender;
  let logSpy: import('vitest').MockInstance;

  beforeEach(() => {
    siemSender = new ConsoleSIEMSender();
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('should support logging all classifications', async () => {
    const classifications: SIEMClassification[] = [
      'security',
      'governance',
      'data',
      'content',
    ];

    for (const classification of classifications) {
      await siemSender.send({
        event: 'TEST_EVENT',
        classification,
        message: `Testing classification: ${classification}`,
      });

      expect(logSpy).toHaveBeenCalledWith(
        `[SIEM LOG] [${classification.toUpperCase()}] Event: TEST_EVENT | Message: Testing classification: ${classification}`,
      );
    }
  });

  it('should format message with metadata if provided', async () => {
    await siemSender.send({
      event: 'USER_LOGIN',
      classification: 'security',
      message: 'User logged in successfully',
      metadata: { userId: 'user-123', ip: '127.0.0.1' },
    });

    expect(logSpy).toHaveBeenCalledWith(
      `[SIEM LOG] [SECURITY] Event: USER_LOGIN | Message: User logged in successfully | Metadata: {"userId":"user-123","ip":"127.0.0.1"}`,
    );
  });
});
