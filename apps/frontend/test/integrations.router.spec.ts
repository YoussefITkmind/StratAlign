import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCClientError } from "@trpc/client";

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

const calls = vi.hoisted(() => ({ investigate: vi.fn(), list: vi.fn() }));

vi.mock("@/server/backend-integrations-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/backend-integrations-client")
  >("@/server/backend-integrations-client");
  return {
    ...actual,
    createBackendIntegrationsClient: vi.fn(() => ({
      integrations: {
        syncLogs: {
          list: { query: calls.list },
          investigate: { mutate: calls.investigate },
        },
      },
    })),
  };
});

import { integrationsRouter } from "@/server/routers/integrations";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SYNC_LOG_ID = "22222222-2222-4222-8222-222222222222";

function caller(session: unknown = { user: { id: USER_ID, email: "steward@example.test" } }) {
  return integrationsRouter.createCaller({ session, cookieHeader: "session=persisted" } as never);
}

const diagnosis = {
  syncLogId: SYNC_LOG_ID,
  integration: "Snowflake ETL Service",
  kind: "SYNC_FAILURE",
  source: "ai",
  diagnosis: "The source system rejected the credential supplied by this integration.",
  likelyCause: "An expired or revoked authentication credential.",
  confidence: "medium",
  evidence: ["The run reported 3 errors."],
  recommendedActions: ["Check the source credentials for this integration."],
  insufficientData: false,
  insufficientReasons: [],
  volume: null,
  evidenceLogCount: 4,
  generatedAt: "2026-08-25T09:00:00.000Z",
};

/**
 * The browser-facing proxy holds no AI credentials and makes no diagnostic
 * decision — these tests hold it to that: it authenticates, revalidates the
 * identifier, forwards, and preserves the distinction between "the AI provider
 * is down" and "your request was bad", which the UI needs to offer the right
 * recovery.
 */
describe("Integrations frontend proxy: sync investigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an unauthenticated caller before touching the backend", async () => {
    await expect(
      caller(null).syncLogs.investigate({ syncLogId: SYNC_LOG_ID }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(calls.investigate).not.toHaveBeenCalled();
  });

  it("forwards a valid identifier and returns the diagnosis unchanged", async () => {
    calls.investigate.mockResolvedValue(diagnosis);

    await expect(
      caller().syncLogs.investigate({ syncLogId: SYNC_LOG_ID }),
    ).resolves.toEqual(diagnosis);
    expect(calls.investigate).toHaveBeenCalledWith({ syncLogId: SYNC_LOG_ID });
  });

  it("returns an insufficient-data diagnosis without reinterpreting it", async () => {
    calls.investigate.mockResolvedValue({
      ...diagnosis,
      source: "deterministic",
      likelyCause: null,
      confidence: "low",
      insufficientData: true,
      insufficientReasons: ["NO_HISTORICAL_VOLUME"],
    });

    await expect(
      caller().syncLogs.investigate({ syncLogId: SYNC_LOG_ID }),
    ).resolves.toMatchObject({ insufficientData: true, likelyCause: null });
  });

  it("rejects a malformed sync log id before it reaches the backend", async () => {
    await expect(
      caller().syncLogs.investigate({ syncLogId: "not-a-uuid" }),
    ).rejects.toThrow();
    expect(calls.investigate).not.toHaveBeenCalled();
  });

  it.each([
    ["SERVICE_UNAVAILABLE"],
    ["TIMEOUT"],
    ["UNPROCESSABLE_CONTENT"],
    ["NOT_FOUND"],
  ])("preserves a %s failure rather than flattening it to BAD_REQUEST", async (code) => {
    calls.investigate.mockRejectedValue(
      Object.assign(new TRPCClientError("Investigation could not complete"), {
        data: { code },
      }),
    );

    await expect(
      caller().syncLogs.investigate({ syncLogId: SYNC_LOG_ID }),
    ).rejects.toMatchObject({ code });
  });

  it("collapses an unrecognised backend code to BAD_REQUEST", async () => {
    calls.investigate.mockRejectedValue(
      Object.assign(new TRPCClientError("something odd"), { data: { code: "TEAPOT" } }),
    );

    await expect(
      caller().syncLogs.investigate({ syncLogId: SYNC_LOG_ID }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("does not leak a transport failure's detail to the browser", async () => {
    calls.investigate.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.4:4000"));

    const error = await caller()
      .syncLogs.investigate({ syncLogId: SYNC_LOG_ID })
      .then(() => null)
      .catch((thrown: unknown) => thrown as { code: string; message: string });

    expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error?.message).not.toContain("ECONNREFUSED");
  });

  it("leaves the existing sync log listing working", async () => {
    calls.list.mockResolvedValue([]);

    await expect(caller().syncLogs.list()).resolves.toEqual([]);
  });
});
