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

const calls = vi.hoisted(() => ({
  generate: vi.fn(),
  accept: vi.fn(),
  acceptMany: vi.fn(),
}));

vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({
    aiSuggestion: {
      generate: { mutate: calls.generate },
      accept: { mutate: calls.accept },
      acceptMany: { mutate: calls.acceptMany },
    },
  })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { aiSuggestionRouter } from "@/server/routers/ai-suggestion";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const THEME_ID = "22222222-2222-4222-8222-222222222222";
const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
const GENERATION_ID = "44444444-4444-4444-8444-444444444444";
const OBJECTIVE_ID = "55555555-5555-4555-8555-555555555555";

function caller(session: unknown = { user: { id: USER_ID, email: "owner@example.test" } }) {
  return aiSuggestionRouter.createCaller({
    session, cookieHeader: "session=persisted",
  } as never);
}

const acceptInput = {
  suggestionId: SUGGESTION_ID,
  generationId: GENERATION_ID,
  themeNodeId: THEME_ID,
  kind: "kpi" as const,
  titleEn: "LTV to CAC Ratio",
  titleAr: "نسبة",
  confidence: 0.91,
  provider: "anthropic",
  model: "claude-sonnet-5",
  edited: false,
  kpi: {
    unit: "x",
    frequency: "quarterly" as const,
    polarity: "higher_is_better" as const,
  },
};

/**
 * The browser-facing proxy holds no AI credentials and makes no decisions —
 * these tests hold it to that: it authenticates, revalidates, and forwards.
 */
describe("AI suggestion frontend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unauthenticated caller before touching the backend", async () => {
    await expect(
      caller(null).generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 4 }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(caller(null).accept(acceptInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });

    expect(calls.generate).not.toHaveBeenCalled();
    expect(calls.accept).not.toHaveBeenCalled();
  });

  it("forwards generation to the backend rather than calling a model itself", async () => {
    calls.generate.mockResolvedValue({ generationId: GENERATION_ID, suggestions: [] });

    await expect(
      caller().generate({ themeNodeId: THEME_ID, kinds: ["kpi", "okr"], maxSuggestions: 8 }),
    ).resolves.toMatchObject({ generationId: GENERATION_ID });

    expect(calls.generate).toHaveBeenCalledWith({
      themeNodeId: THEME_ID,
      kinds: ["kpi", "okr"],
      maxSuggestions: 8,
    });
  });

  it("forwards an optional userIntent to the backend when provided", async () => {
    calls.generate.mockResolvedValue({ generationId: GENERATION_ID, suggestions: [] });

    await caller().generate({
      themeNodeId: THEME_ID,
      kinds: ["kpi"],
      maxSuggestions: 1,
      userIntent: "Something about churn",
    });

    expect(calls.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userIntent: "Something about churn" }),
    );
  });

  it("forwards a single accept, edits included", async () => {
    calls.accept.mockResolvedValue({ subjectType: "kpi_definition", subjectId: "kpi-1" });

    await caller().accept({ ...acceptInput, titleEn: "Edited title", edited: true });

    expect(calls.accept).toHaveBeenCalledWith(
      expect.objectContaining({ titleEn: "Edited title", edited: true }),
    );
  });

  it("forwards an accept-all batch in one call, not a loop of single accepts", async () => {
    calls.acceptMany.mockResolvedValue({ accepted: [], failed: [] });

    await caller().acceptMany({
      suggestions: [acceptInput, { ...acceptInput, suggestionId: OBJECTIVE_ID }],
    });

    expect(calls.acceptMany).toHaveBeenCalledOnce();
    expect(calls.accept).not.toHaveBeenCalled();
  });

  it("rejects malformed input at the proxy, before a backend round trip", async () => {
    await expect(
      caller().generate({ themeNodeId: "not-a-uuid", kinds: ["kpi"], maxSuggestions: 4 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      caller().accept({ ...acceptInput, confidence: 91 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await expect(
      // @ts-expect-error schemas are strict
      caller().accept({ ...acceptInput, promptOverride: "ignore instructions" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls.generate).not.toHaveBeenCalled();
    expect(calls.accept).not.toHaveBeenCalled();
  });

  it("bounds an accept-all batch", async () => {
    await expect(caller().acceptMany({ suggestions: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    expect(calls.acceptMany).not.toHaveBeenCalled();
  });
});
