import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const testTrpc = initTRPC.context<{
    session: { user?: { id?: string; email?: string } } | null;
    cookieHeader: string | null;
  }>().create();
  return {
    router: testTrpc.router,
    authenticatedProcedure: testTrpc.procedure.use(({ ctx, next }) => {
      if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
      return next({ ctx });
    }),
  };
});

const calls = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({
    audioBrief: { generate: { mutate: calls.generate } },
  })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { audioBriefRouter } from "@/server/routers/audio-brief";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function caller(session: unknown = { user: { id: USER_ID, email: "member@example.test" } }) {
  return audioBriefRouter.createCaller({ session, cookieHeader: "session=persisted" } as never);
}

const briefOutput = {
  title: "Executive Audio Brief",
  script: "Here is your executive briefing. Revenue Growth is currently off track.",
  items: [{ type: "kpi", name: "Revenue Growth", importance: "critical", reason: "18 percent below target." }],
  audioBase64: "ZmFrZS1tcDMtYnl0ZXM=",
  audioMimeType: "audio/mpeg",
  provider: "openai",
  model: "gpt-4o-mini",
  ttsProvider: "openai",
  ttsModel: "tts-1",
  latencyMs: 812,
};

/**
 * The browser-facing proxy holds no AI credentials, sends no report data of
 * its own, and makes no decisions — these tests hold it to that: it
 * authenticates and forwards.
 */
describe("Audio brief frontend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unauthenticated caller before touching the backend", async () => {
    await expect(caller(null).generate({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(calls.generate).not.toHaveBeenCalled();
  });

  it("forwards a signed-in caller's request to the backend and returns the brief", async () => {
    calls.generate.mockResolvedValue(briefOutput);

    await expect(caller().generate({})).resolves.toEqual(briefOutput);
    expect(calls.generate).toHaveBeenCalledWith({});
  });

  it("surfaces a backend failure as a safe, generic error", async () => {
    const { TRPCError } = await import("@trpc/server");
    calls.generate.mockRejectedValue(
      new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Unable to generate the audio brief. Please try again." }),
    );

    await expect(caller().generate({})).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
