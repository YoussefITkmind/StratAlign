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
  list: vi.fn(), createDraft: vi.fn(), retire: vi.fn(), align: vi.fn(),
  publish: vi.fn(), strategyNodes: vi.fn(),
}));

vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({
    registry: {
      kpi: {
        list: { query: calls.list }, get: { query: vi.fn() },
        createDraft: { mutate: calls.createDraft }, publishVersion: { mutate: calls.publish },
        retire: { mutate: calls.retire }, listVersions: { query: vi.fn() },
        retirementImpact: { query: vi.fn() },
      },
      okr: { list: { query: vi.fn() }, get: { query: vi.fn() }, create: { mutate: vi.fn() } },
      alignment: { set: { mutate: calls.align } },
    },
    strategy: { node: { list: { query: calls.strategyNodes } } },
  })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { registryRouter } from "@/server/routers/registry";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KPI_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "44444444-4444-4444-8444-444444444444";

function caller() {
  return registryRouter.createCaller({
    session: { user: { id: USER_ID, email: "registry@example.test" } },
    user: undefined, cookieHeader: "session=persisted",
  } as never);
}

describe("KPI Registry frontend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads persisted KPI and Strategy data from the backend", async () => {
    calls.list.mockResolvedValue([{ definition: { id: KPI_ID }, version: { version: 2 } }]);
    calls.strategyNodes.mockResolvedValue([{ id: "objective-1", type: "objective" }]);
    await expect(caller().kpi.list()).resolves.toHaveLength(1);
    await expect(caller().strategyNodes()).resolves.toEqual([{ id: "objective-1", type: "objective" }]);
    expect(calls.list).toHaveBeenCalledOnce();
    expect(calls.strategyNodes).toHaveBeenCalledOnce();
  });

  it("forwards version creation, alignment, and retirement instead of using local state", async () => {
    const draft = {
      kpiDefinitionId: KPI_ID, nameEn: "Persisted KPI", nameAr: "مؤشر", unit: "%",
      polarity: "higher_is_better" as const, frequency: "monthly" as const,
      dataSourceType: "manual" as const, ownerUserId: USER_ID,
      activeFrom: new Date("2026-08-11T00:00:00.000Z"),
    };
    calls.createDraft.mockResolvedValue({ definition: { id: KPI_ID }, version: { id: VERSION_ID } });
    calls.align.mockResolvedValue([]);
    calls.retire.mockResolvedValue({ id: KPI_ID, status: "retired" });
    await caller().kpi.createDraft(draft);
    await caller().alignment.set({ kpiDefinitionId: KPI_ID, alignments: [{ strategyNodeId: "objective-1", alignmentType: "objective" }] });
    await caller().kpi.retire({ kpiDefinitionId: KPI_ID });
    expect(calls.createDraft).toHaveBeenCalledWith(draft);
    expect(calls.align).toHaveBeenCalledOnce();
    expect(calls.retire).toHaveBeenCalledWith({ kpiDefinitionId: KPI_ID });
  });

  it("publishes only through the approval-gated backend operation", async () => {
    calls.publish.mockResolvedValue({ id: VERSION_ID, publishedAt: new Date() });
    await caller().kpi.publishVersion({ kpiVersionId: VERSION_ID, approvalCaseId: CASE_ID });
    expect(calls.publish).toHaveBeenCalledWith({ kpiVersionId: VERSION_ID, approvalCaseId: CASE_ID });
  });
});
