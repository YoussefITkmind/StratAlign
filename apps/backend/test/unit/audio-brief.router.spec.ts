import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiMalformedOutputError,
  AiTimeoutError,
  AiUnavailableError,
} from "../../src/modules/ai/ai.errors";

/**
 * Contract tests for the audio-brief tRPC surface. The service is mocked, so a
 * failure here is unambiguously about the router: who may call it, what it
 * promises back, and what a caller is told when generation fails.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const session = {
  user: { id: userId, email: "exec@example.test", name: "Exec" },
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
  title: "Executive Brief",
  script: "Revenue Growth is off track at forty percent against a target of one hundred.",
  insufficientData: false,
  audio: {
    base64: Buffer.from("fake-mp3-bytes").toString("base64"),
    contentType: "audio/mpeg",
    format: "mp3" as const,
  },
};

describe("Audio brief tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordCompletedCall.mockResolvedValue(undefined);
    generate.mockResolvedValue(validOutput);
  });

  it("refuses an unauthenticated caller", async () => {
    const caller = rootRouter.createCaller(context(null) as never);

    await expect(caller.audioBrief.generate({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("generates a brief for a signed-in caller and passes their identity through", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.audioBrief.generate({})).resolves.toEqual(validOutput);
    expect(generate).toHaveBeenCalledWith({ actorUserId: userId, role: undefined });
  });

  it("forwards an optional role without interpreting it", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await caller.audioBrief.generate({ role: "executive_viewer" });

    expect(generate).toHaveBeenCalledWith({ actorUserId: userId, role: "executive_viewer" });
  });

  it("rejects an unknown field on the input (strict schema)", async () => {
    const caller = rootRouter.createCaller(context() as never);

    await expect(
      caller.audioBrief.generate({ voice: "nova" } as never),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });

  it("fails rather than returning an output the schema does not permit", async () => {
    generate.mockResolvedValue({ ...validOutput, audio: { ...validOutput.audio, format: "wav" } });
    const caller = rootRouter.createCaller(context() as never);

    await expect(caller.audioBrief.generate({})).rejects.toThrow();
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

  it("maps an unrecognised failure to a generic internal error", async () => {
    generate.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.4:5432"));
    const caller = rootRouter.createCaller(context() as never);

    const failure = await caller.audioBrief.generate({}).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(String((failure as Error).message)).not.toContain("ECONNREFUSED");
  });

  it("reports the service being absent from context as an internal error", async () => {
    const withoutService: Record<string, unknown> = { ...context() };
    delete withoutService.audioBrief;
    const caller = rootRouter.createCaller(withoutService as never);

    await expect(caller.audioBrief.generate({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
