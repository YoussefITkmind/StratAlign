import { beforeEach, describe, expect, it, vi } from "vitest";
import { CadenceGeneratorService } from "../../src/modules/scheduler/cadence-generator.service";
import { CadenceEngine } from "../../src/modules/cadence/cadence.engine";
import { PeriodCalendarEngine } from "../../src/modules/cadence/period-calendar.engine";
import type { PrismaService } from "../../src/database/prisma.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import {
  CadenceInstanceStatus,
  CadenceStatus,
  CatchUpPolicy,
  PeriodType,
} from "../../src/generated/prisma/enums";

/**
 * Time is supplied explicitly to `materialize(id, now)` rather than mocked
 * globally. The service takes its clock as a parameter precisely so tests can
 * be deterministic without touching timers.
 */
const NOW = new Date("2026-08-05T12:00:00Z");

function buildDefinition(overrides: Record<string, unknown> = {}) {
  return {
    id: "definition-1",
    key: "daily-collection",
    status: CadenceStatus.ACTIVE,
    subjectType: "kpi_collection",
    subjectId: "kpi-42",
    payload: { notification: { templateKey: "schedule" } },
    cadenceConfig: { type: "DAILY", atTime: "09:00" },
    timezone: "UTC",
    anchorAt: new Date("2026-08-01T00:00:00Z"),
    startsAt: new Date("2026-08-01T00:00:00Z"),
    endsAt: null,
    catchUpPolicy: CatchUpPolicy.FIRE_LATEST_ONLY,
    lookaheadSeconds: 300,
    windowOpenOffsetMinutes: 0,
    windowDurationMinutes: 480,
    closingWarningMinutes: 60,
    reviewDueOffsetMinutes: 120,
    // Materialised up to the start of today, so the base fixture yields exactly
    // one occurrence (today at 09:00). Catch-up tests wind this back to create
    // a deliberate backlog.
    lastMaterializedAt: new Date("2026-08-05T00:00:00Z"),
    periodCalendar: null,
    ...overrides,
  };
}

describe("CadenceGeneratorService", () => {
  let definitionFindUnique: ReturnType<typeof vi.fn>;
  let definitionFindUniqueOrThrow: ReturnType<typeof vi.fn>;
  let definitionUpdate: ReturnType<typeof vi.fn>;
  let instanceCreateMany: ReturnType<typeof vi.fn>;
  let instanceAggregate: ReturnType<typeof vi.fn>;
  let instanceFindMany: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let service: CadenceGeneratorService;

  /** Rows handed to createMany, which is what the service actually persists. */
  function createdRows(): Record<string, unknown>[] {
    return instanceCreateMany.mock.calls[0]?.[0]?.data ?? [];
  }

  beforeEach(() => {
    definitionFindUnique = vi.fn().mockResolvedValue(buildDefinition());
    definitionFindUniqueOrThrow = vi.fn().mockResolvedValue(buildDefinition());
    definitionUpdate = vi.fn().mockResolvedValue({});
    instanceCreateMany = vi.fn().mockImplementation(
      async (args: { data: unknown[] }) => ({ count: args.data.length }),
    );
    instanceAggregate = vi.fn().mockResolvedValue({ _max: { sequence: null } });
    instanceFindMany = vi.fn().mockResolvedValue([]);
    enqueue = vi.fn().mockResolvedValue(undefined);

    const tx = {
      cadenceInstance: {
        createMany: instanceCreateMany,
        aggregate: instanceAggregate,
      },
      cadenceDefinition: {
        findUniqueOrThrow: definitionFindUniqueOrThrow,
        update: definitionUpdate,
      },
    };

    const prisma = {
      cadenceDefinition: {
        findUnique: definitionFindUnique,
        findUniqueOrThrow: definitionFindUniqueOrThrow,
        update: definitionUpdate,
      },
      cadenceInstance: { findMany: instanceFindMany },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;

    service = new CadenceGeneratorService(
      prisma,
      new CadenceEngine(),
      new PeriodCalendarEngine(),
      { enqueue } as unknown as QueueService,
      { maxCatchUpOccurrences: 50, tickIntervalMs: 60_000 },
      createLogger("error"),
    );
  });

  describe("guards", () => {
    it("does nothing for a definition that no longer exists", async () => {
      definitionFindUnique.mockResolvedValue(null);

      const result = await service.materialize("missing", NOW);

      expect(result).toEqual({ created: 0, skipped: 0, nextOccurrenceAt: null });
      expect(instanceCreateMany).not.toHaveBeenCalled();
    });

    it("does nothing for a paused definition", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({ status: CadenceStatus.PAUSED }),
      );

      const result = await service.materialize("definition-1", NOW);

      expect(result.created).toBe(0);
      expect(instanceCreateMany).not.toHaveBeenCalled();
    });

    it("does nothing for a cancelled definition", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({ status: CadenceStatus.CANCELLED }),
      );

      await service.materialize("definition-1", NOW);

      expect(instanceCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("milestone derivation", () => {
    it("derives every milestone from the configured offsets", async () => {
      await service.materialize("definition-1", NOW);

      const row = createdRows()[0];

      // Occurrence 09:00; window opens +0, runs 480 min to 17:00, closing
      // warning 60 min before that, review due 120 min after close.
      expect((row.occurrenceAt as Date).toISOString()).toBe("2026-08-05T09:00:00.000Z");
      expect((row.windowOpensAt as Date).toISOString()).toBe("2026-08-05T09:00:00.000Z");
      expect((row.windowClosingAt as Date).toISOString()).toBe("2026-08-05T16:00:00.000Z");
      expect((row.windowClosesAt as Date).toISOString()).toBe("2026-08-05T17:00:00.000Z");
      expect((row.reviewDueAt as Date).toISOString()).toBe("2026-08-05T19:00:00.000Z");
    });

    it("applies a window open offset", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({ windowOpenOffsetMinutes: 30 }),
      );

      const row = (await materializeAndRead()) as Record<string, unknown>;

      expect((row.windowOpensAt as Date).toISOString()).toBe("2026-08-05T09:30:00.000Z");
      expect((row.windowClosesAt as Date).toISOString()).toBe("2026-08-05T17:30:00.000Z");
    });

    it("clamps a closing warning longer than the window to the open instant", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({ windowDurationMinutes: 30, closingWarningMinutes: 120 }),
      );

      const row = (await materializeAndRead()) as Record<string, unknown>;

      // Without the clamp the warning would land before the window opened.
      expect((row.windowClosingAt as Date).toISOString()).toBe(
        (row.windowOpensAt as Date).toISOString(),
      );
    });

    it("points the first transition at the window opening", async () => {
      const row = (await materializeAndRead()) as Record<string, unknown>;

      expect(row.status).toBe(CadenceInstanceStatus.PENDING);
      expect((row.nextTransitionAt as Date).toISOString()).toBe(
        (row.windowOpensAt as Date).toISOString(),
      );
    });

    it("freezes the definition payload onto the instance", async () => {
      const row = (await materializeAndRead()) as Record<string, unknown>;

      expect(row.payloadSnapshot).toEqual({
        notification: { templateKey: "schedule" },
      });
    });
  });

  describe("period resolution", () => {
    it("leaves period fields null when no calendar is attached", async () => {
      const row = (await materializeAndRead()) as Record<string, unknown>;

      expect(row.periodKey).toBeNull();
      expect(row.periodStartsAt).toBeNull();
    });

    it("resolves the period when a calendar is attached", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          periodCalendar: {
            periodType: PeriodType.MONTH,
            fiscalYearStartMonth: 1,
            timezone: "UTC",
          },
        }),
      );

      const row = (await materializeAndRead()) as Record<string, unknown>;

      expect(row.periodKey).toBe("2026-08");
      expect((row.periodStartsAt as Date).toISOString()).toBe("2026-08-01T00:00:00.000Z");
      expect((row.periodEndsAt as Date).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    });
  });

  describe("catch-up policy", () => {
    /**
     * Four days of missed daily occurrences (Aug 1-4 at 09:00) plus today's,
     * as if the worker had been down since the definition started.
     */
    function withBacklog(policy: CatchUpPolicy) {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          catchUpPolicy: policy,
          lastMaterializedAt: new Date("2026-08-01T00:00:00Z"),
        }),
      );
    }

    it("FIRE_ALL keeps every missed occurrence", async () => {
      withBacklog(CatchUpPolicy.FIRE_ALL);

      await service.materialize("definition-1", NOW);

      const pending = createdRows().filter(
        (row) => row.status === CadenceInstanceStatus.PENDING,
      );

      // Aug 1, 2, 3, 4 and 5 at 09:00 — all before noon on the 5th.
      expect(pending).toHaveLength(5);
    });

    it("FIRE_LATEST_ONLY keeps only the most recent missed occurrence", async () => {
      withBacklog(CatchUpPolicy.FIRE_LATEST_ONLY);

      await service.materialize("definition-1", NOW);

      const rows = createdRows();
      const pending = rows.filter((row) => row.status === CadenceInstanceStatus.PENDING);
      const skipped = rows.filter((row) => row.status === CadenceInstanceStatus.SKIPPED);

      expect(pending).toHaveLength(1);
      expect((pending[0].occurrenceAt as Date).toISOString()).toBe(
        "2026-08-05T09:00:00.000Z",
      );
      expect(skipped).toHaveLength(4);
    });

    it("SKIP_MISSED discards every missed occurrence", async () => {
      withBacklog(CatchUpPolicy.SKIP_MISSED);

      await service.materialize("definition-1", NOW);

      const pending = createdRows().filter(
        (row) => row.status === CadenceInstanceStatus.PENDING,
      );

      expect(pending).toHaveLength(0);
    });

    it("records a reason on every skipped occurrence rather than dropping it", async () => {
      withBacklog(CatchUpPolicy.SKIP_MISSED);

      await service.materialize("definition-1", NOW);

      const skipped = createdRows().filter(
        (row) => row.status === CadenceInstanceStatus.SKIPPED,
      );

      expect(skipped.length).toBeGreaterThan(0);
      for (const row of skipped) {
        expect(row.skipReason).toBeTypeOf("string");
        expect(row.skipReason).not.toBe("");
        // Skipped instances must never be scheduled to transition.
        expect(row.nextTransitionAt).toBeNull();
      }
    });

    it("caps a catch-up backlog and marks the overflow skipped", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          catchUpPolicy: CatchUpPolicy.FIRE_ALL,
          cadenceConfig: { type: "INTERVAL", everySeconds: 3600 },
          lastMaterializedAt: new Date("2026-08-01T00:00:00Z"),
        }),
      );

      const capped = new CadenceGeneratorService(
        (service as unknown as { prisma: PrismaService }).prisma,
        new CadenceEngine(),
        new PeriodCalendarEngine(),
        { enqueue } as unknown as QueueService,
        { maxCatchUpOccurrences: 3, tickIntervalMs: 60_000 },
        createLogger("error"),
      );

      await capped.materialize("definition-1", NOW);

      const rows = createdRows();
      const pending = rows.filter((row) => row.status === CadenceInstanceStatus.PENDING);
      const overflow = rows.filter((row) =>
        String(row.skipReason ?? "").includes("catch-up cap"),
      );

      expect(pending.length).toBeLessThanOrEqual(4);
      expect(overflow.length).toBeGreaterThan(0);
    });
  });

  describe("idempotency and bookkeeping", () => {
    it("creates instances with skipDuplicates so a replayed pass is a no-op", async () => {
      await service.materialize("definition-1", NOW);

      expect(instanceCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
    });

    it("continues the sequence from the highest existing instance", async () => {
      instanceAggregate.mockResolvedValue({ _max: { sequence: 11 } });

      await service.materialize("definition-1", NOW);

      expect(createdRows()[0].sequence).toBe(12);
    });

    it("advances the materialisation cursor", async () => {
      await service.materialize("definition-1", NOW);

      const cursorUpdate = definitionUpdate.mock.calls.find(
        (call) => call[0].data.lastMaterializedAt !== undefined,
      );

      expect(cursorUpdate).toBeDefined();
    });

    it("stops at endsAt and completes the definition", async () => {
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          cadenceConfig: { type: "ONCE", runAt: "2026-08-05T09:00:00.000Z" },
          endsAt: new Date("2026-08-05T13:00:00Z"),
        }),
      );
      definitionFindUniqueOrThrow.mockResolvedValue(
        buildDefinition({
          cadenceConfig: { type: "ONCE", runAt: "2026-08-05T09:00:00.000Z" },
          endsAt: new Date("2026-08-05T13:00:00Z"),
        }),
      );

      await service.materialize("definition-1", NOW);

      const completion = definitionUpdate.mock.calls.find(
        (call) => call[0].data.status === CadenceStatus.COMPLETED,
      );

      expect(completion).toBeDefined();
      expect(completion?.[0].data.nextOccurrenceAt).toBeNull();
    });
  });

  describe("imminent transition scheduling", () => {
    it("enqueues an exactly-delayed job for a milestone inside the next tick", async () => {
      // Window opens two seconds from now, well inside the 60s tick.
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          cadenceConfig: {
            type: "ONCE",
            runAt: "2026-08-05T12:00:02.000Z",
          },
        }),
      );

      instanceFindMany.mockResolvedValue([
        {
          id: "instance-1",
          status: CadenceInstanceStatus.PENDING,
          nextTransitionAt: new Date("2026-08-05T12:00:02Z"),
        },
      ]);

      await service.materialize("definition-1", NOW);

      expect(enqueue).toHaveBeenCalledOnce();

      const [, , , options] = enqueue.mock.calls[0];
      expect(options.jobId).toBe("advance--instance-1--PENDING");
      expect(options.delayMs).toBe(2000);
    });

    it("does not enqueue for a milestone beyond the next tick", async () => {
      // Opens at 12:04, past the 12:01 tick horizon but still inside the
      // 5-minute lookahead, so it is materialised without a delayed job. The
      // tick that follows will pick it up.
      definitionFindUnique.mockResolvedValue(
        buildDefinition({
          cadenceConfig: { type: "ONCE", runAt: "2026-08-05T12:04:00.000Z" },
        }),
      );

      await service.materialize("definition-1", NOW);

      expect(enqueue).not.toHaveBeenCalled();
    });
  });

  async function materializeAndRead(): Promise<unknown> {
    await service.materialize("definition-1", NOW);
    return createdRows()[0];
  }
});
