import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchedulerService } from "../../src/modules/scheduler/scheduler.service";
import { CadenceEngine } from "../../src/modules/cadence/cadence.engine";
import type { PrismaService } from "../../src/database/prisma.service";
import { createLogger } from "../../src/logging/logger";
import { PermanentError } from "../../src/errors/app.errors";
import {
  CadenceInstanceStatus,
  CadenceStatus,
  CatchUpPolicy,
} from "../../src/generated/prisma/enums";

const VALID_INPUT = {
  key: "monthly-collection",
  name: "Monthly collection",
  subjectType: "kpi_collection",
  subjectId: "kpi-42",
  cadence: { type: "MONTHLY", atTime: "09:00", onDayOfMonth: 5 } as const,
  startsAt: new Date("2026-08-05T00:00:00Z"),
  anchorAt: new Date("2026-08-05T00:00:00Z"),
};

describe("SchedulerService", () => {
  let create: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;
  let findUniqueOrThrow: ReturnType<typeof vi.fn>;
  let instanceUpdateMany: ReturnType<typeof vi.fn>;
  let service: SchedulerService;

  beforeEach(() => {
    create = vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: "definition-1",
      ...args.data,
    }));
    update = vi.fn().mockResolvedValue({ id: "definition-1" });
    findUniqueOrThrow = vi.fn().mockResolvedValue({
      id: "definition-1",
      cadenceConfig: { type: "MONTHLY", atTime: "09:00", onDayOfMonth: 5 },
      timezone: "UTC",
      anchorAt: new Date("2026-08-05T00:00:00Z"),
      startsAt: new Date("2026-08-05T00:00:00Z"),
      lastMaterializedAt: null,
      endsAt: null,
      status: CadenceStatus.ACTIVE,
    });
    instanceUpdateMany = vi.fn().mockResolvedValue({ count: 2 });

    const tx = {
      cadenceDefinition: { update },
      cadenceInstance: { updateMany: instanceUpdateMany },
    };

    const prisma = {
      cadenceDefinition: { create, update, findUniqueOrThrow },
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;

    service = new SchedulerService(
      prisma,
      new CadenceEngine(),
      { defaultTimezone: "UTC", defaultLookaheadSeconds: 300 },
      createLogger("error"),
    );
  });

  describe("createDefinition", () => {
    it("stores the cadence and computes the first occurrence", async () => {
      await service.createDefinition(VALID_INPUT);

      const data = create.mock.calls[0][0].data;

      expect(data.cadenceType).toBe("MONTHLY");
      expect((data.nextOccurrenceAt as Date).toISOString()).toBe(
        "2026-08-05T09:00:00.000Z",
      );
    });

    it("stores the opaque subject fields verbatim", async () => {
      await service.createDefinition({
        ...VALID_INPUT,
        payload: { notification: { templateKey: "schedule" } },
      });

      const data = create.mock.calls[0][0].data;

      // The scheduler must persist these without interpreting them.
      expect(data.subjectType).toBe("kpi_collection");
      expect(data.subjectId).toBe("kpi-42");
      expect(data.payload).toEqual({ notification: { templateKey: "schedule" } });
    });

    it("defaults payload to an empty object", async () => {
      await service.createDefinition(VALID_INPUT);

      expect(create.mock.calls[0][0].data.payload).toEqual({});
    });

    it("applies the configured defaults", async () => {
      await service.createDefinition(VALID_INPUT);

      const data = create.mock.calls[0][0].data;

      expect(data.timezone).toBe("UTC");
      expect(data.lookaheadSeconds).toBe(300);
      expect(data.catchUpPolicy).toBe(CatchUpPolicy.FIRE_LATEST_ONLY);
    });

    it("rejects an invalid cadence configuration", async () => {
      await expect(
        service.createDefinition({
          ...VALID_INPUT,
          cadence: { type: "MONTHLY", atTime: "25:00", onDayOfMonth: 5 } as never,
        }),
      ).rejects.toThrow(PermanentError);

      expect(create).not.toHaveBeenCalled();
    });

    it("rejects a monthly cadence that specifies neither day rule", async () => {
      await expect(
        service.createDefinition({
          ...VALID_INPUT,
          cadence: { type: "MONTHLY", atTime: "09:00" } as never,
        }),
      ).rejects.toThrow(/exactly one of onDayOfMonth or onNthWeekday/);
    });

    it("rejects an unknown time zone", async () => {
      await expect(
        service.createDefinition({ ...VALID_INPUT, timezone: "Mars/Olympus_Mons" }),
      ).rejects.toThrow(PermanentError);
    });

    it("rejects an end date at or before the start date", async () => {
      await expect(
        service.createDefinition({
          ...VALID_INPUT,
          endsAt: new Date("2026-08-04T00:00:00Z"),
        }),
      ).rejects.toThrow("endsAt must be after startsAt");
    });

    it("accepts a valid non-UTC time zone", async () => {
      await service.createDefinition({ ...VALID_INPUT, timezone: "Asia/Dubai" });

      const data = create.mock.calls[0][0].data;

      expect(data.timezone).toBe("Asia/Dubai");
      // 09:00 in Dubai is 05:00 UTC.
      expect((data.nextOccurrenceAt as Date).toISOString()).toBe(
        "2026-08-05T05:00:00.000Z",
      );
    });
  });

  describe("lifecycle", () => {
    it("pauses a definition", async () => {
      await service.pause("definition-1");

      expect(update).toHaveBeenCalledWith({
        where: { id: "definition-1" },
        data: { status: CadenceStatus.PAUSED },
      });
    });

    it("recomputes the cursor when resuming, since it went stale while paused", async () => {
      await service.resume("definition-1");

      const statusUpdate = update.mock.calls.find(
        (call) => call[0].data.status === CadenceStatus.ACTIVE,
      );
      const cursorUpdate = update.mock.calls.find(
        (call) => call[0].data.nextOccurrenceAt !== undefined,
      );

      expect(statusUpdate).toBeDefined();
      expect(cursorUpdate).toBeDefined();
    });

    it("cancels the definition and discards instances that have not started", async () => {
      await service.cancel("definition-1", "No longer required");

      expect(update).toHaveBeenCalledWith({
        where: { id: "definition-1" },
        data: { status: CadenceStatus.CANCELLED, nextOccurrenceAt: null },
      });

      const instanceUpdate = instanceUpdateMany.mock.calls[0][0];

      // Only PENDING instances are discarded; anything already in flight keeps
      // its history.
      expect(instanceUpdate.where.status).toBe(CadenceInstanceStatus.PENDING);
      expect(instanceUpdate.data.status).toBe(CadenceInstanceStatus.SKIPPED);
      expect(instanceUpdate.data.skipReason).toBe("No longer required");
      expect(instanceUpdate.data.nextTransitionAt).toBeNull();
    });
  });

  describe("recomputeNextOccurrence", () => {
    it("advances from the last materialised instant", async () => {
      findUniqueOrThrow.mockResolvedValue({
        id: "definition-1",
        cadenceConfig: { type: "MONTHLY", atTime: "09:00", onDayOfMonth: 5 },
        timezone: "UTC",
        anchorAt: new Date("2026-08-01T00:00:00Z"),
        startsAt: new Date("2026-08-01T00:00:00Z"),
        lastMaterializedAt: new Date("2026-08-05T12:00:00Z"),
        endsAt: null,
      });

      const next = await service.recomputeNextOccurrence("definition-1");

      expect(next?.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    });

    it("returns null when the next occurrence falls beyond endsAt", async () => {
      findUniqueOrThrow.mockResolvedValue({
        id: "definition-1",
        cadenceConfig: { type: "MONTHLY", atTime: "09:00", onDayOfMonth: 5 },
        timezone: "UTC",
        anchorAt: new Date("2026-08-01T00:00:00Z"),
        startsAt: new Date("2026-08-01T00:00:00Z"),
        lastMaterializedAt: new Date("2026-08-05T12:00:00Z"),
        endsAt: new Date("2026-08-31T23:59:59Z"),
      });

      const next = await service.recomputeNextOccurrence("definition-1");

      expect(next).toBeNull();
      expect(update.mock.calls[0][0].data.nextOccurrenceAt).toBeNull();
    });
  });
});
