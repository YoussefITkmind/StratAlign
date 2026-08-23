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

const calls = vi.hoisted(() => ({ ask: vi.fn() }));

vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({
    assistant: { ask: { mutate: calls.ask } },
  })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { assistantRouter } from "@/server/routers/assistant";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function caller(session: unknown = { user: { id: USER_ID, email: "member@example.test" } }) {
  return assistantRouter.createCaller({ session, cookieHeader: "session=persisted" } as never);
}

const askInput = {
  message: "What is the current revenue growth?",
  context: {
    module: "balanced_scorecards",
    moduleName: "Balanced Scorecards",
    route: "/balanced-scorecards",
    entity: null,
    data: { kpis: [{ name: "Revenue Growth", status: "on_track" }] },
    capabilities: ["analyze_kpis"],
  },
  history: [] as { role: "user" | "assistant"; content: string }[],
};

const askOutput = {
  answer: "Revenue Growth is currently on track.",
  confidence: 0.8,
  grounded: true,
  insufficientContext: false,
  referencedEntities: ["Revenue Growth"],
};

/**
 * The browser-facing proxy holds no AI credentials and makes no decisions —
 * these tests hold it to that: it authenticates, revalidates, and forwards.
 */
describe("Assistant frontend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unauthenticated caller before touching the backend", async () => {
    await expect(caller(null).ask(askInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(calls.ask).not.toHaveBeenCalled();
  });

  it("forwards a well-formed question to the backend and returns its answer", async () => {
    calls.ask.mockResolvedValue(askOutput);

    await expect(caller().ask(askInput)).resolves.toEqual(askOutput);
    expect(calls.ask).toHaveBeenCalledWith(askInput);
  });

  it("rejects an empty message before it reaches the backend", async () => {
    await expect(caller().ask({ ...askInput, message: "   " })).rejects.toThrow();
    expect(calls.ask).not.toHaveBeenCalled();
  });

  it("rejects more history turns than the bound allows", async () => {
    const tooMuchHistory = Array.from({ length: 13 }, (_, index) => ({
      role: "user" as const,
      content: `turn ${index}`,
    }));

    await expect(caller().ask({ ...askInput, history: tooMuchHistory })).rejects.toThrow();
    expect(calls.ask).not.toHaveBeenCalled();
  });
});
