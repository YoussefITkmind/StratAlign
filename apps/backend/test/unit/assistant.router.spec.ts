import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiMalformedOutputError, AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";

/**
 * Contract tests for the assistant tRPC surface. The service is mocked, so a
 * failure here is unambiguously about the router: who may call it, what
 * input it accepts, what it promises back, and what a caller is told when
 * the assistant fails.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = {
  user: { id: userId, email: "member@example.test", name: "Member" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const ask = vi.fn();
const recordCompletedCall = vi.fn();

function context(sessionOverride: typeof session | null = session) {
  return {
    health: { check: vi.fn() },
    credentials: { authenticate: vi.fn() },
    loginRateLimiter: { consume: vi.fn(), reset: vi.fn() },
    clientIp: "127.0.0.1",
    session: sessionOverride,
    oidcIdentities: { reconcile: vi.fn() },
    auditTap: { recordCompletedCall },
    authenticationFreshness: { record: vi.fn() },
    authorization: { resolve: vi.fn() },
    iam: { getStepUpPolicy: vi.fn() },
    assistant: { ask },
  };
}

const validInput = {
  message: "Which KPIs are currently underperforming?",
  context: {
    module: "balanced_scorecards",
    moduleName: "Balanced Scorecards",
    route: "/balanced-scorecards",
    entity: null,
    data: { kpis: [{ name: "Revenue Growth", status: "on_track" }] },
    capabilities: ["analyze_kpis"],
  },
  history: [{ role: "user" as const, content: "Hi" }],
};

const validOutput = {
  answer: "Based on the current scorecard, no KPI is off track.",
  confidence: 0.85,
  grounded: true,
  insufficientContext: false,
  referencedEntities: ["Revenue Growth"],
};

describe("Assistant tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordCompletedCall.mockResolvedValue(undefined);
    ask.mockResolvedValue(validOutput);
  });

  it("refuses an unauthenticated caller", async () => {
    const caller = rootRouter.createCaller(context(null) as never);

    await expect(caller.assistant.ask(validInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(ask).not.toHaveBeenCalled();
  });

  it("forwards a signed-in caller's question to the service and returns its answer", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.assistant.ask(validInput)).resolves.toEqual(validOutput);
    expect(ask).toHaveBeenCalledWith(validInput);
  });

  it("rejects a message over the length limit before reaching the service", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(
      caller.assistant.ask({ ...validInput, message: "x".repeat(2_001) }),
    ).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });

  it("rejects an unknown field on the context payload (strict schema)", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(
      caller.assistant.ask({
        ...validInput,
        context: { ...validInput.context, extra: "not allowed" },
      } as never),
    ).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });

  it.each([
    [new AiUnavailableError(), "SERVICE_UNAVAILABLE"],
    [new AiTimeoutError(), "TIMEOUT"],
    [new AiMalformedOutputError(), "UNPROCESSABLE_CONTENT"],
  ])("maps %j to %s without leaking the raw error", async (thrown, code) => {
    ask.mockRejectedValue(thrown);
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.assistant.ask(validInput)).rejects.toMatchObject({ code });
  });

  it("maps an unrecognised failure to a generic internal error", async () => {
    ask.mockRejectedValue(new Error("some internal detail that must not leak"));
    const caller = rootRouter.createCaller(context() as never);

    const failure = await caller.assistant.ask(validInput).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(String((failure as Error).message)).not.toContain("must not leak");
  });
});
