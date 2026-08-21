import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import type { EventBusService } from "../../src/events/event-bus.service";
import { GovernanceEscalationService } from "../../src/modules/governance/governance-escalation.service";

describe("GovernanceEscalationService retrieval", () => {
  it("reads persisted participant escalations with context and stable deadline ordering", async () => {
    const rows = [{ id: "escalation-1", acknowledgedAt: null, approvalCase: { entityType: "RuleDefinition" } }];
    const findMany = vi.fn().mockResolvedValue(rows);
    const service = new GovernanceEscalationService(
      { escalationCase: { findMany } } as unknown as PrismaService,
      {} as EventBusService,
    );

    await expect(service.listForParticipant("user-1", false)).resolves.toBe(rows);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { participant: "user-1", acknowledgedAt: null },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      include: expect.objectContaining({
        approvalCase: expect.any(Object),
        participantUser: expect.any(Object),
        acknowledger: expect.any(Object),
      }),
    }));
  });

  it("can include both acknowledged and unacknowledged persisted rows", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new GovernanceEscalationService(
      { escalationCase: { findMany } } as unknown as PrismaService,
      {} as EventBusService,
    );
    await service.listForParticipant("user-1");
    expect(findMany.mock.calls[0]![0].where).toEqual({ participant: "user-1" });
  });
});
