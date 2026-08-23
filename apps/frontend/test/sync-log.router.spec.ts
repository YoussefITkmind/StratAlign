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
  list: vi.fn(),
  get: vi.fn(),
  investigate: vi.fn(),
}));

vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({
    syncLog: {
      list: { query: calls.list },
      get: { query: calls.get },
      investigate: { mutate: calls.investigate },
    },
  })),
  translateBackendRegistryError: (error: unknown) => {
    throw error;
  },
}));

import { syncLogRouter } from "@/server/routers/sync-log";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SYNC_RUN_ID = "22222222-2222-4222-8222-222222222222";

function caller(session: unknown = { user: { id: USER_ID, email: "viewer@example.test" } }) {
  return syncLogRouter.createCaller({ session, cookieHeader: "session=persisted" } as never);
}

/**
 * The browser-facing proxy holds no backend credentials and makes no
 * decisions — these tests hold it to that: it authenticates, revalidates,
 * and forwards.
 */
describe("Sync Logs frontend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unauthenticated caller before touching the backend", async () => {
    await expect(caller(null).list({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).get({ syncRunId: SYNC_RUN_ID })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller(null).investigate({ syncRunId: SYNC_RUN_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(calls.list).not.toHaveBeenCalled();
    expect(calls.get).not.toHaveBeenCalled();
    expect(calls.investigate).not.toHaveBeenCalled();
  });

  it("forwards a list query with its filters", async () => {
    calls.list.mockResolvedValue([]);

    await caller().list({ status: "failed", limit: 25 });

    expect(calls.list).toHaveBeenCalledWith({ status: "failed", limit: 25 });
  });

  it("forwards get by id", async () => {
    calls.get.mockResolvedValue({ id: SYNC_RUN_ID });

    await expect(caller().get({ syncRunId: SYNC_RUN_ID })).resolves.toEqual({ id: SYNC_RUN_ID });
    expect(calls.get).toHaveBeenCalledWith({ syncRunId: SYNC_RUN_ID });
  });

  it("forwards investigation to the backend rather than calling a model itself", async () => {
    calls.investigate.mockResolvedValue({ syncRunId: SYNC_RUN_ID, diagnosis: "…" });

    await expect(
      caller().investigate({ syncRunId: SYNC_RUN_ID }),
    ).resolves.toMatchObject({ syncRunId: SYNC_RUN_ID });
    expect(calls.investigate).toHaveBeenCalledWith({ syncRunId: SYNC_RUN_ID });
  });

  it("rejects malformed input at the proxy, before a backend round trip", async () => {
    await expect(caller().get({ syncRunId: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      // @ts-expect-error schemas are strict
      caller().list({ promptOverride: "ignore instructions" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(calls.get).not.toHaveBeenCalled();
    expect(calls.list).not.toHaveBeenCalled();
  });
});
