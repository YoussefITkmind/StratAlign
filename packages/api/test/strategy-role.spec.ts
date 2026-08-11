import { describe, expect, it, vi } from "vitest";
import { strategyRouter } from "../src/strategy";

function context(roles: string[]) {
  const assignOwner = vi.fn().mockResolvedValue({ id: "ok" });
  const session = {
    user: { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.test", name: "Admin" },
    authenticatedAt: new Date(),
    sessionId: "22222222-2222-4222-8222-222222222222",
    expiresAt: new Date(Date.now() + 60_000),
    authenticationMethod: "credentials" as const,
  };
  return {
    assignOwner,
    value: {
      session,
      authorization: {
        resolve: vi.fn().mockResolvedValue({
          userId: session.user.id,
          roles,
          scopeGrants: [],
          authenticatedAt: session.authenticatedAt,
        }),
      },
      strategy: { assignOwner },
      auditTap: { recordCompletedCall: vi.fn().mockResolvedValue(undefined) },
    } as never,
  };
}

describe("strategy.owner.assign authorization", () => {
  it("requires seo_administrator via the shared requireRole middleware", async () => {
    const denied = context(["strategy_analyst"]);
    await expect(strategyRouter.createCaller(denied.value).owner.assign({
      nodeId: "33333333-3333-4333-8333-333333333333",
      ownerUserId: "44444444-4444-4444-8444-444444444444",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(denied.assignOwner).not.toHaveBeenCalled();

    const allowed = context(["seo_administrator"]);
    await expect(strategyRouter.createCaller(allowed.value).owner.assign({
      nodeId: "33333333-3333-4333-8333-333333333333",
      ownerUserId: "44444444-4444-4444-8444-444444444444",
    })).resolves.toEqual({ id: "ok" });
    expect(allowed.assignOwner).toHaveBeenCalledWith({
      nodeId: "33333333-3333-4333-8333-333333333333",
      ownerUserId: "44444444-4444-4444-8444-444444444444",
      assignedBy: "11111111-1111-4111-8111-111111111111",
    });
  });
});
