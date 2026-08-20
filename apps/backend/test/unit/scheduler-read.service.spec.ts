import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import { SchedulerReadService } from "../../src/modules/scheduler/scheduler-read.service";

describe("SchedulerReadService calendar projection", () => {
  it("uses a bounded occurrence window, optional filters, and stable ordering", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new SchedulerReadService({ cadenceInstance: { findMany } } as unknown as PrismaService);
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2027-01-01T00:00:00Z");

    await expect(service.listInstances({
      from,
      to,
      statuses: ["OPEN", "REVIEW_DUE"],
      cadenceDefinitionId: "11111111-1111-4111-8111-111111111111",
    })).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        occurrenceAt: { gte: from, lt: to },
        status: { in: ["OPEN", "REVIEW_DUE"] },
        cadenceDefinitionId: "11111111-1111-4111-8111-111111111111",
      },
      orderBy: [{ occurrenceAt: "asc" }, { id: "asc" }],
      include: expect.objectContaining({ cadenceDefinition: expect.any(Object) }),
    }));
  });

  it("supports empty results and rejects invalid ranges", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new SchedulerReadService({ cadenceInstance: { findMany } } as unknown as PrismaService);
    const at = new Date("2026-08-20T00:00:00Z");
    await expect(service.listInstances({ from: at, to: at })).rejects.toThrow("from before to");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("retrieves a persisted instance with its cadence definition", async () => {
    const row = { id: "instance-1", cadenceDefinition: { key: "monthly-review" } };
    const findUnique = vi.fn().mockResolvedValue(row);
    const service = new SchedulerReadService({ cadenceInstance: { findUnique } } as unknown as PrismaService);
    await expect(service.getInstance("instance-1")).resolves.toBe(row);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "instance-1" } }));
  });
});
