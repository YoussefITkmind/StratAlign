import { describe, expect, it, vi } from "vitest";
import type { PlatformRole } from "@spm/domain-iam";
import type { TrpcContext } from "./index";
import { valueRouter } from "./value";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const GATE_ID = "22222222-2222-4222-8222-222222222222";

function createContext(role: PlatformRole) {
  const decideGateReview = vi.fn(async (input: unknown) => input);
  const context = {
    session: {
      user: { id: USER_ID, email: "committee@example.test", name: "Committee Member" },
      authenticatedAt: new Date(),
      sessionId: "value-gate-authorization-test",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      authenticationMethod: "credentials" as const,
    },
    authorization: {
      resolve: async () => ({
        userId: USER_ID,
        roles: [role],
        scopeGrants: [],
        authenticatedAt: new Date(),
      }),
    },
    value: { decideGateReview },
    auditTap: { recordCompletedCall: async () => undefined },
  } as unknown as TrpcContext;
  return { context, decideGateReview };
}

describe("Value Gate decision authorization", () => {
  it("allows a governance committee member to invoke the human decision procedure", async () => {
    const { context, decideGateReview } = createContext("governance_committee");
    const caller = valueRouter.createCaller(context);

    await caller.gate.decide({ gateReviewId: GATE_ID, decision: "continue" });
    expect(decideGateReview).toHaveBeenCalledWith({
      gateReviewId: GATE_ID,
      decision: "continue",
      decidedBy: USER_ID,
    });
  });

  it.each<PlatformRole>(["seo_administrator", "platform_administrator", "initiative_owner", "vmo_lead"])(
    "rejects %s from the gate decision procedure",
    async (role) => {
      const { context, decideGateReview } = createContext(role);
      const caller = valueRouter.createCaller(context);
      await expect(caller.gate.decide({ gateReviewId: GATE_ID, decision: "continue" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(decideGateReview).not.toHaveBeenCalled();
    },
  );
});
