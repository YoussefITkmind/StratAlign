import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

import { AiMalformedOutputError, AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";

/**
 * Contract tests for the Executive Audio Brief tRPC surface. The service is
 * mocked, so a failure here is unambiguously about the router: who may call
 * it, what it promises back, and what a caller is told when generation
 * fails. Authorization is the same rule the Home overview snapshot already
 * uses — any signed-in user may request a brief over the same report data
 * they can already see there.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = {
  user: { id: userId, email: "member@example.test", name: "Member" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const generate = vi.fn();
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
    audioBrief: { generate },
  };
}

const validOutput = {
  title: "Executive Audio Brief",
  script: "Here is your executive briefing. Revenue Growth is currently off track.",
  items: [
    { type: "kpi" as const, name: "Revenue Growth", importance: "critical" as const, reason: "18 percent below target." },
  ],
  audioBase64: Buffer.from("fake-mp3-bytes").toString("base64"),
  audioMimeType: "audio/mpeg",
  provider: "openai",
  model: "gpt-4o-mini",
  ttsProvider: "openai",
  ttsModel: "tts-1",
  latencyMs: 812,
};

describe("Audio brief tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordCompletedCall.mockResolvedValue(undefined);
    generate.mockResolvedValue(validOutput);
  });

  it("refuses an unauthenticated caller", async () => {
    const caller = rootRouter.createCaller(context(null) as never);

    await expect(caller.audioBrief.generate({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates a brief for a signed-in caller, scoped to their own id", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.audioBrief.generate({})).resolves.toEqual(validOutput);
    expect(generate).toHaveBeenCalledWith(userId);
  });

  it("rejects an unknown input field (strict schema)", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(
      caller.audioBrief.generate({ extra: "not allowed" } as never),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    [new AiUnavailableError(), "SERVICE_UNAVAILABLE"],
    [new AiTimeoutError(), "TIMEOUT"],
    [new AiMalformedOutputError(), "UNPROCESSABLE_CONTENT"],
  ])("maps %j to %s without leaking the raw error", async (thrown, code) => {
    generate.mockRejectedValue(thrown);
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.audioBrief.generate({})).rejects.toMatchObject({ code });
  });

  it("maps an unrecognised failure to a generic internal error without leaking detail", async () => {
    generate.mockRejectedValue(new Error("some internal detail that must not leak"));
    const caller = rootRouter.createCaller(context() as never);

    const failure = await caller.audioBrief.generate({}).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(String((failure as Error).message)).not.toContain("must not leak");
  });
});
