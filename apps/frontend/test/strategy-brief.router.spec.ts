import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The browser-facing proxy owns three things and nothing else: a session is
 * required, the input is revalidated before it leaves the browser tier, and
 * the call is forwarded verbatim. Generation, authorisation, and every model
 * decision belong to the backend, so nothing here should look like a second
 * implementation of them.
 */

vi.mock("@/server/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user?: { id?: string } } | null; cookieHeader: string | null }>().create();
  return { router: t.router, authenticatedProcedure: t.procedure.use(({ ctx, next }) => {
    if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx });
  }) };
});

const calls = vi.hoisted(() => ({
  get: vi.fn(), generate: vi.fn(), updateSection: vi.fn(),
}));
vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({ strategyBrief: {
    get: { query: calls.get },
    generate: { mutate: calls.generate },
    updateSection: { mutate: calls.updateSection },
  } })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { strategyBriefRouter } from "@/server/routers/strategy-brief";

const USER = "22222222-2222-4222-8222-222222222222";
const ROOT = "33333333-3333-4333-8333-333333333333";
const caller = () =>
  strategyBriefRouter.createCaller({
    session: { user: { id: USER } },
    cookieHeader: "session=real",
  } as never);

describe("Strategy Brief backend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the stored brief", async () => {
    calls.get.mockResolvedValue({ rootNodeId: ROOT, title: "Acme Corp 2025 Strategic Plan" });

    await expect(caller().get()).resolves.toMatchObject({ rootNodeId: ROOT });
  });

  it("passes through a null brief when none has been generated", async () => {
    calls.get.mockResolvedValue(null);

    await expect(caller().get()).resolves.toBeNull();
  });

  it("forwards a generation request", async () => {
    calls.generate.mockResolvedValue({ rootNodeId: ROOT });

    await caller().generate({ rootNodeId: ROOT });

    expect(calls.generate).toHaveBeenCalledWith({ rootNodeId: ROOT });
  });

  it("forwards a section edit", async () => {
    calls.updateSection.mockResolvedValue({ rootNodeId: ROOT });
    const input = { section: "executiveSummary" as const, content: "An executive rewrote this." };

    await caller().updateSection(input);

    expect(calls.updateSection).toHaveBeenCalledWith(input);
  });

  it("forwards a null edit, which reverts the section to the AI text", async () => {
    calls.updateSection.mockResolvedValue({ rootNodeId: ROOT });

    await caller().updateSection({ section: "strategicVision", content: null });

    expect(calls.updateSection).toHaveBeenCalledWith({
      section: "strategicVision",
      content: null,
    });
  });

  it("propagates a backend failure rather than masking it", async () => {
    calls.generate.mockRejectedValue(new Error("The AI service is unavailable right now."));

    await expect(caller().generate()).rejects.toThrow("unavailable");
  });

  it("rejects an edit that is empty after trimming before it leaves the browser tier", async () => {
    await expect(
      caller().updateSection({ section: "executiveSummary", content: "   " }),
    ).rejects.toBeTruthy();
    expect(calls.updateSection).not.toHaveBeenCalled();
  });

  it("rejects an unknown section", async () => {
    await expect(
      caller().updateSection({ section: "risks" as never, content: "Text" }),
    ).rejects.toBeTruthy();
    expect(calls.updateSection).not.toHaveBeenCalled();
  });

  it("rejects a root node id that is not a uuid", async () => {
    await expect(caller().generate({ rootNodeId: "not-a-uuid" })).rejects.toBeTruthy();
    expect(calls.generate).not.toHaveBeenCalled();
  });

  it("refuses every procedure without a session", async () => {
    const anonCaller = strategyBriefRouter.createCaller({ session: null, cookieHeader: null } as never);

    await expect(anonCaller.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonCaller.generate()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      anonCaller.updateSection({ section: "executiveSummary", content: "Text" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(calls.get).not.toHaveBeenCalled();
    expect(calls.generate).not.toHaveBeenCalled();
    expect(calls.updateSection).not.toHaveBeenCalled();
  });
});
