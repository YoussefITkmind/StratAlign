import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the Strategy Brief tRPC surface.
 *
 * The service is mocked so a failure here is unambiguously a router problem —
 * who may call it, what input it accepts, what shape may leave, and what a
 * caller is told when the service or the AI provider fails.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rootNodeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const themeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const session = {
  user: { id: userId, email: "owner@example.test", name: "Strategy Owner" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const get = vi.fn();
const generate = vi.fn();
const updateSection = vi.fn();

function context(sessionOverride: typeof session | null = session) {
  return {
    health: { check: vi.fn() },
    credentials: { authenticate: vi.fn() },
    loginRateLimiter: { consume: vi.fn(), reset: vi.fn() },
    clientIp: "127.0.0.1",
    session: sessionOverride,
    oidcIdentities: { reconcile: vi.fn() },
    auditTap: { recordCompletedCall: vi.fn() },
    authenticationFreshness: { record: vi.fn() },
    authorization: { resolve },
    iam: { getStepUpPolicy: vi.fn() },
    rules: {},
    audit: {},
    registry: {},
    strategyBrief: { get, generate, updateSection },
  };
}

function authorization(roles: string[]) {
  return { userId, roles, scopeGrants: [], authenticatedAt: new Date() };
}

const briefOutput = {
  rootNodeId,
  title: "Acme Corp 2025 Strategic Plan",
  generatedAt: "2026-08-25T00:00:00.000Z",
  executiveSummary: {
    content: "The plan spans one theme and one objective.",
    source: "ai" as const,
    aiContent: "The plan spans one theme and one objective.",
  },
  strategicVision: {
    content: "Sustainable value creation.",
    source: "strategy" as const,
    aiContent: null,
  },
  strategicThemes: [{ id: themeId, name: "Revenue & Growth", objectiveCount: 2 }],
  strategicObjectives: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      name: "Drive Revenue Growth 40% YoY",
      themeId,
      themeName: "Revenue & Growth",
      owner: "Sarah Chen",
      progress: 67,
      health: "on-track" as const,
    },
  ],
  expectedOutcomes: ["Achieve measurable improvement in revenue growth"],
  risks: [
    {
      severity: "medium" as const,
      area: "Revenue & Growth",
      title: "Revenue theme is at risk",
      mitigation: "Immediate executive review required.",
    },
  ],
  insufficientData: false,
  insufficientDataReason: null,
  provider: "anthropic",
  model: "claude-sonnet-5",
};

describe("strategyBrief tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["seo_administrator"]));
    get.mockResolvedValue(briefOutput);
    generate.mockResolvedValue(briefOutput);
    updateSection.mockResolvedValue(briefOutput);
  });

  describe("authentication", () => {
    it("refuses every procedure without a session", async () => {
      const caller = rootRouter.createCaller(context(null) as never);

      await expect(caller.strategyBrief.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.strategyBrief.generate()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        caller.strategyBrief.updateSection({ section: "executiveSummary", content: "Text" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      expect(get).not.toHaveBeenCalled();
      expect(generate).not.toHaveBeenCalled();
      expect(updateSection).not.toHaveBeenCalled();
    });
  });

  describe("authorization", () => {
    it("allows any authenticated caller to read the brief", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.get()).resolves.toEqual(briefOutput);
    });

    it("refuses generate and updateSection without seo_administrator", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.generate()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.strategyBrief.updateSection({ section: "strategicVision", content: "Text" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(generate).not.toHaveBeenCalled();
      expect(updateSection).not.toHaveBeenCalled();
    });

    it("allows generate and updateSection for seo_administrator", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.generate()).resolves.toEqual(briefOutput);
      await expect(
        caller.strategyBrief.updateSection({ section: "executiveSummary", content: "Rewritten." }),
      ).resolves.toEqual(briefOutput);
    });

    it("forwards the actor's identity from the session into generate", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await caller.strategyBrief.generate({ rootNodeId });

      expect(generate).toHaveBeenCalledWith({ rootNodeId, actorUserId: userId });
    });
  });

  describe("input validation", () => {
    it("rejects unknown fields", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyBrief.generate({ rootNodeId, notAField: true } as never),
      ).rejects.toBeTruthy();
      expect(generate).not.toHaveBeenCalled();
    });

    it("rejects a root node id that is not a uuid", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyBrief.generate({ rootNodeId: "not-a-uuid" }),
      ).rejects.toBeTruthy();
      expect(generate).not.toHaveBeenCalled();
    });

    it("rejects an unknown editable section", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyBrief.updateSection({ section: "risks" as never, content: "Text" }),
      ).rejects.toBeTruthy();
      expect(updateSection).not.toHaveBeenCalled();
    });

    it("rejects an edit that is empty after trimming", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyBrief.updateSection({ section: "executiveSummary", content: "   " }),
      ).rejects.toBeTruthy();
      expect(updateSection).not.toHaveBeenCalled();
    });

    it("accepts a null edit, which reverts the section to the AI text", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await caller.strategyBrief.updateSection({ section: "executiveSummary", content: null });

      expect(updateSection).toHaveBeenCalledWith({
        rootNodeId: undefined,
        edit: { section: "executiveSummary", content: null },
      });
    });
  });

  describe("output", () => {
    it("returns null when no brief has been generated yet", async () => {
      get.mockResolvedValue(null);
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.get()).resolves.toBeNull();
    });

    it("refuses to emit a brief that does not match the output contract", async () => {
      generate.mockResolvedValue({ ...briefOutput, strategicThemes: [{ id: themeId }] });
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.generate()).rejects.toBeTruthy();
    });
  });

  describe("error mapping", () => {
    const cases = [
      ["AI_STRATEGY_NOT_FOUND", "NOT_FOUND"],
      ["AI_BRIEF_NOT_FOUND", "NOT_FOUND"],
      ["AI_UNAVAILABLE", "SERVICE_UNAVAILABLE"],
      ["AI_TIMEOUT", "TIMEOUT"],
      ["AI_MALFORMED_OUTPUT", "UNPROCESSABLE_CONTENT"],
    ] as const;

    for (const [domainCode, httpCode] of cases) {
      it(`maps ${domainCode} to ${httpCode}`, async () => {
        generate.mockRejectedValue(Object.assign(new Error("internal detail"), { code: domainCode }));
        const caller = rootRouter.createCaller(context() as never);

        await expect(caller.strategyBrief.generate()).rejects.toMatchObject({ code: httpCode });
      });
    }

    it("collapses an unexpected failure to a generic message that leaks nothing", async () => {
      generate.mockRejectedValue(new Error("anthropic account acct_123 quota exceeded"));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyBrief.generate()).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "We couldn't generate the strategy brief. Please try again.",
      });
    });
  });
});
