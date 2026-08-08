import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulerTickService } from "../../src/modules/scheduler/scheduler-tick.service";
import type { ScheduleTransitionService } from "../../src/modules/scheduler/schedule-transition.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import { CadenceInstanceStatus, CadenceStatus } from "../../src/generated/prisma/enums";
import { QUEUE_NAMES } from "../../src/queue/queue.constants";

const NOW = new Date("2026-08-05T12:00:00Z");
const TICK_INTERVAL_MS = 60_000;

describe("SchedulerTickService", () => {
  let definitionFindMany: ReturnType<typeof vi.fn>;
  let instanceFindMany: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let countWaiting: ReturnType<typeof vi.fn>;
  let enqueueAdvance: ReturnType<typeof vi.fn>;
  let service: SchedulerTickService;

  beforeEach(() => {
    definitionFindMany = vi.fn().mockResolvedValue([]);
    instanceFindMany = vi.fn().mockResolvedValue([]);
    enqueue = vi.fn().mockResolvedValue(undefined);
    countWaiting = vi.fn().mockResolvedValue(0);
    enqueueAdvance = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      cadenceDefinition: { findMany: definitionFindMany },
      cadenceInstance: { findMany: instanceFindMany },
    } as unknown as PrismaService;

    service = new SchedulerTickService(
      prisma,
      { enqueue, countWaiting } as unknown as QueueService,
      { enqueueAdvance } as unknown as ScheduleTransitionService,
      {
        lookaheadSeconds: 300,
        batchSize: 500,
        tickIntervalMs: TICK_INTERVAL_MS,
        maxWaitingMaterializeJobs: 2000,
      },
      createLogger("error"),
    );
  });

  describe("definition sweep", () => {
    it("queries only active definitions inside the lookahead horizon", async () => {
      await service.tick(NOW);

      const where = definitionFindMany.mock.calls[0][0].where;

      expect(where.status).toBe(CadenceStatus.ACTIVE);
      // 12:00 plus a 300s lookahead.
      expect(where.startsAt.lte.toISOString()).toBe("2026-08-05T12:05:00.000Z");
    });

    it("also picks up definitions that have never been materialised", async () => {
      await service.tick(NOW);

      // Without this branch a freshly created definition would never be swept,
      // because its nextOccurrenceAt cursor has not been set yet.
      expect(definitionFindMany.mock.calls[0][0].where.OR).toContainEqual({
        nextOccurrenceAt: null,
        lastMaterializedAt: null,
      });
    });

    it("enqueues one materialise job per due definition", async () => {
      definitionFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);

      const result = await service.tick(NOW);

      expect(result.definitionsEnqueued).toBe(2);

      const materializeCalls = enqueue.mock.calls.filter(
        (call) => call[0] === QUEUE_NAMES.schedulerMaterialize,
      );
      expect(materializeCalls).toHaveLength(2);
    });

    it("buckets the job id by tick window so overlapping ticks collapse", async () => {
      definitionFindMany.mockResolvedValue([{ id: "a" }]);

      await service.tick(NOW);
      const firstJobId = enqueue.mock.calls[0][3].jobId;

      enqueue.mockClear();

      // 30 seconds later — still the same 60s bucket.
      await service.tick(new Date(NOW.getTime() + 30_000));
      const sameBucketJobId = enqueue.mock.calls[0][3].jobId;

      enqueue.mockClear();

      // 90 seconds later — a new bucket, so a new job is allowed.
      await service.tick(new Date(NOW.getTime() + 90_000));
      const nextBucketJobId = enqueue.mock.calls[0][3].jobId;

      expect(sameBucketJobId).toBe(firstJobId);
      expect(nextBucketJobId).not.toBe(firstJobId);
    });
  });

  describe("backpressure", () => {
    it("skips the definition sweep when the materialise queue is backed up", async () => {
      countWaiting.mockResolvedValue(2000);
      definitionFindMany.mockResolvedValue([{ id: "a" }]);

      const result = await service.tick(NOW);

      expect(result.throttled).toBe(true);
      expect(result.definitionsEnqueued).toBe(0);
      expect(definitionFindMany).not.toHaveBeenCalled();
    });

    it("still advances instances while throttled", async () => {
      countWaiting.mockResolvedValue(5000);
      instanceFindMany.mockResolvedValue([
        {
          id: "instance-1",
          status: CadenceInstanceStatus.OPEN,
          nextTransitionAt: new Date("2026-08-05T12:00:30Z"),
        },
      ]);

      const result = await service.tick(NOW);

      // Backpressure must not stall milestones that are already due, or a
      // backlog would silently delay every notification.
      expect(result.throttled).toBe(true);
      expect(result.instancesEnqueued).toBe(1);
      expect(enqueueAdvance).toHaveBeenCalledOnce();
    });
  });

  describe("transition sweep", () => {
    it("reaches one tick interval ahead so milestones get exact delayed jobs", async () => {
      await service.tick(NOW);

      const where = instanceFindMany.mock.calls[0][0].where;

      expect(where.nextTransitionAt.lte.toISOString()).toBe("2026-08-05T12:01:00.000Z");
      expect(where.status.in).toEqual([
        CadenceInstanceStatus.PENDING,
        CadenceInstanceStatus.OPEN,
        CadenceInstanceStatus.CLOSING,
        CadenceInstanceStatus.CLOSED,
      ]);
    });

    it("never sweeps terminal instances", async () => {
      await service.tick(NOW);

      const statuses = instanceFindMany.mock.calls[0][0].where.status.in;

      expect(statuses).not.toContain(CadenceInstanceStatus.COMPLETED);
      expect(statuses).not.toContain(CadenceInstanceStatus.SKIPPED);
      expect(statuses).not.toContain(CadenceInstanceStatus.REVIEW_DUE);
    });

    it("delegates each due instance to the transition service", async () => {
      const nextTransitionAt = new Date("2026-08-05T12:00:45Z");

      instanceFindMany.mockResolvedValue([
        { id: "instance-1", status: CadenceInstanceStatus.OPEN, nextTransitionAt },
      ]);

      await service.tick(NOW);

      expect(enqueueAdvance).toHaveBeenCalledWith(
        "instance-1",
        CadenceInstanceStatus.OPEN,
        nextTransitionAt,
        NOW,
      );
    });

    it("reports both sweeps in its result", async () => {
      definitionFindMany.mockResolvedValue([{ id: "a" }]);
      instanceFindMany.mockResolvedValue([
        {
          id: "instance-1",
          status: CadenceInstanceStatus.PENDING,
          nextTransitionAt: NOW,
        },
      ]);

      const result = await service.tick(NOW);

      expect(result).toEqual({
        definitionsEnqueued: 1,
        instancesEnqueued: 1,
        throttled: false,
      });
    });
  });
});
