import { describe, expect, it, vi } from "vitest";
import type { PlatformRole } from "@spm/domain-iam";
import type { TrpcContext } from "./index";
import { scorecardRouter } from "./scorecard";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSPECTIVE_ID = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE_ID = "33333333-3333-4333-8333-333333333333";

function createContext(role: PlatformRole) {
  const setPlacement = vi.fn(async (input: {
    perspectiveId: string;
    objectiveNodeId: string;
  }) => input);

  const context = {
    session: {
      user: {
        id: USER_ID,
        email: "map-editor@example.test",
        name: "Map Editor",
      },
      authenticatedAt: new Date(),
      sessionId: "strategy-map-authorization-test",
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
    scorecard: {
      setPlacement,
    },
    auditTap: {
      recordCompletedCall: async () => undefined,
    },
  } as unknown as TrpcContext;

  return { context, setPlacement };
}

describe("Strategy Map objective placement authorization", () => {
  it("allows a strategy analyst to place an existing objective", async () => {
    const { context, setPlacement } = createContext("strategy_analyst");
    const caller = scorecardRouter.createCaller(context);

    await expect(caller.map.placeObjective({
      perspectiveId: PERSPECTIVE_ID,
      objectiveNodeId: OBJECTIVE_ID,
    })).resolves.toEqual({
      perspectiveId: PERSPECTIVE_ID,
      objectiveNodeId: OBJECTIVE_ID,
    });

    expect(setPlacement).toHaveBeenCalledOnce();
  });

  it("rejects an SEO administrator who is not a strategy analyst", async () => {
    const { context, setPlacement } = createContext("seo_administrator");
    const caller = scorecardRouter.createCaller(context);

    await expect(caller.map.placeObjective({
      perspectiveId: PERSPECTIVE_ID,
      objectiveNodeId: OBJECTIVE_ID,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(setPlacement).not.toHaveBeenCalled();
  });
});
