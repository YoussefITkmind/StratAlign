import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleTransitionService } from "../../src/modules/scheduler/schedule-transition.service";
import type { EventBusService } from "../../src/events/event-bus.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { QueueService } from "../../src/queue/queue.service";
import { createLogger } from "../../src/logging/logger";
import { CadenceInstanceStatus } from "../../src/generated/prisma/enums";
import { SCHEDULE_EVENT_TYPES } from "../../src/modules/scheduler/scheduler.events";

const OCCURRENCE = new Date("2026-08-05T09:00:00Z");

function buildInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: "instance-1",
    cadenceDefinitionId: "definition-1",
    sequence: 0,
    occurrenceAt: OCCURRENCE,
    windowOpensAt: new Date("2026-08-05T09:00:00Z"),
    windowClosingAt: new Date("2026-08-05T17:00:00Z"),
    windowClosesAt: new Date("2026-08-05T18:00:00Z"),
    reviewDueAt: new Date("2026-08-06T09:00:00Z"),
    periodKey: "2026-08",
    periodStartsAt: new Date("2026-08-01T00:00:00Z"),
    periodEndsAt: new Date("2026-09-01T00:00:00Z"),
    payloadSnapshot: { notification: { templateKey: "schedule" } },
    status: CadenceInstanceStatus.PENDING,
    cadenceDefinition: {
      key: "kpi-monthly",
      subjectType: "kpi_collection",
      subjectId: "kpi-42",
      timezone: "UTC",
    },
    ...overrides,
  };
}

describe("ScheduleTransitionService", () => {
  let instanceFindUnique: ReturnType<typeof vi.fn>;
  let instanceUpdateMany: ReturnType<typeof vi.fn>;
  let publishWithin: ReturnType<typeof vi.fn>;
  let nudgeRelay: ReturnType<typeof vi.fn>;
  let enqueue: ReturnType<typeof vi.fn>;
  let service: ScheduleTransitionService;

  beforeEach(() => {
    instanceFindUnique = vi.fn();
    instanceUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    publishWithin = vi.fn().mockResolvedValue(1);
    nudgeRelay = vi.fn().mockResolvedValue(undefined);
    enqueue = vi.fn().mockResolvedValue(undefined);

    const tx = {
      cadenceInstance: {
        findUnique: instanceFindUnique,
        updateMany: instanceUpdateMany,
      },
    };

    const prisma = {
      $transaction: vi.fn(
        async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    } as unknown as PrismaService;

    service = new ScheduleTransitionService(
      prisma,
      { publishWithin, nudgeRelay } as unknown as EventBusService,
      { enqueue } as unknown as QueueService,
      createLogger("error"),
    );
  });

  it("opens the window and publishes schedule.window.opened", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(buildInstance())
      .mockResolvedValue(
        buildInstance({ status: CadenceInstanceStatus.OPEN }),
      );

    const result = await service.advance("instance-1", new Date("2026-08-05T09:00:00Z"));

    expect(result.transitions).toBe(1);
    expect(result.status).toBe(CadenceInstanceStatus.OPEN);

    const published = publishWithin.mock.calls[0][1][0];
    expect(published.eventType).toBe(SCHEDULE_EVENT_TYPES.windowOpened);
    expect(published.dedupeKey).toBe("instance-1:schedule.window.opened");
  });

  it("carries the opaque subject and payload through to the event", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(buildInstance())
      .mockResolvedValue(buildInstance({ status: CadenceInstanceStatus.OPEN }));

    await service.advance("instance-1", new Date("2026-08-05T09:00:00Z"));

    const payload = publishWithin.mock.calls[0][1][0].payload;

    expect(payload.subjectType).toBe("kpi_collection");
    expect(payload.subjectId).toBe("kpi-42");
    expect(payload.periodKey).toBe("2026-08");
    expect(payload.payload).toEqual({ notification: { templateKey: "schedule" } });
  });

  it("does not transition before the milestone is due", async () => {
    instanceFindUnique.mockResolvedValue(buildInstance());

    const result = await service.advance("instance-1", new Date("2026-08-05T08:00:00Z"));

    expect(result.transitions).toBe(0);
    expect(publishWithin).not.toHaveBeenCalled();
  });

  it("catches up through every overdue milestone in one pass", async () => {
    const statuses = [
      CadenceInstanceStatus.PENDING,
      CadenceInstanceStatus.OPEN,
      CadenceInstanceStatus.CLOSING,
      CadenceInstanceStatus.CLOSED,
      CadenceInstanceStatus.REVIEW_DUE,
    ];

    let call = 0;
    instanceFindUnique.mockImplementation(async () =>
      buildInstance({ status: statuses[Math.min(call++, statuses.length - 1)] }),
    );

    // Long after every milestone, as if the worker had been down.
    const result = await service.advance("instance-1", new Date("2026-08-10T00:00:00Z"));

    expect(result.transitions).toBe(4);
    expect(result.status).toBe(CadenceInstanceStatus.REVIEW_DUE);

    const eventTypes = publishWithin.mock.calls.map((args) => args[1][0].eventType);
    expect(eventTypes).toEqual([
      SCHEDULE_EVENT_TYPES.windowOpened,
      SCHEDULE_EVENT_TYPES.windowClosing,
      SCHEDULE_EVENT_TYPES.windowClosed,
      SCHEDULE_EVENT_TYPES.reviewDue,
    ]);
  });

  it("publishes nothing when another worker won the compare-and-set", async () => {
    instanceFindUnique.mockResolvedValue(buildInstance());
    instanceUpdateMany.mockResolvedValue({ count: 0 });

    const result = await service.advance("instance-1", new Date("2026-08-05T09:00:00Z"));

    expect(result.transitions).toBe(0);
    expect(publishWithin).not.toHaveBeenCalled();
  });

  it("does nothing for an instance that is already terminal", async () => {
    instanceFindUnique.mockResolvedValue(
      buildInstance({ status: CadenceInstanceStatus.COMPLETED }),
    );

    const result = await service.advance("instance-1", new Date("2026-08-10T00:00:00Z"));

    expect(result.transitions).toBe(0);
    expect(result.status).toBe(CadenceInstanceStatus.COMPLETED);
  });

  it("does nothing for a skipped instance", async () => {
    instanceFindUnique.mockResolvedValue(
      buildInstance({ status: CadenceInstanceStatus.SKIPPED }),
    );

    const result = await service.advance("instance-1", new Date("2026-08-10T00:00:00Z"));

    expect(result.transitions).toBe(0);
    expect(publishWithin).not.toHaveBeenCalled();
  });

  it("nudges the relay once after publishing", async () => {
    instanceFindUnique
      .mockResolvedValueOnce(buildInstance())
      .mockResolvedValue(buildInstance({ status: CadenceInstanceStatus.OPEN }));

    await service.advance("instance-1", new Date("2026-08-05T09:00:00Z"));

    expect(nudgeRelay).toHaveBeenCalledOnce();
  });

  it("does not nudge the relay when nothing transitioned", async () => {
    instanceFindUnique.mockResolvedValue(buildInstance());

    await service.advance("instance-1", new Date("2026-08-05T08:00:00Z"));

    expect(nudgeRelay).not.toHaveBeenCalled();
  });

  it("enqueues an advance job with the status in its job id", async () => {
    await service.enqueueAdvance(
      "instance-1",
      CadenceInstanceStatus.OPEN,
      new Date("2026-08-05T17:00:00Z"),
      new Date("2026-08-05T16:59:00Z"),
    );

    const [, , , options] = enqueue.mock.calls[0];

    expect(options.jobId).toBe("advance--instance-1--OPEN");
    expect(options.delayMs).toBe(60_000);
  });
});
