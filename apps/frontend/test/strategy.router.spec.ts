import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC.context<{ session: { user?: { id?: string } } | null; cookieHeader: string | null }>().create();
  return { router: t.router, authenticatedProcedure: t.procedure.use(({ ctx, next }) => {
    if (!ctx.session?.user?.id) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx });
  }) };
});

const calls = vi.hoisted(() => ({
  nodes: vi.fn(), node: vi.fn(), trace: vi.fn(), plans: vi.fn(), edges: vi.fn(),
  staged: vi.fn(), createNode: vi.fn(), linkEdge: vi.fn(), openPlan: vi.fn(),
}));
vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({ strategy: {
    node: { list: { query: calls.nodes }, get: { query: calls.node }, trace: { query: calls.trace }, create: { mutate: calls.createNode } },
    planVersion: { list: { query: calls.plans }, open: { mutate: calls.openPlan } },
    edge: { list: { query: calls.edges }, link: { mutate: calls.linkEdge } },
    stagedChange: { list: { query: calls.staged } },
  } })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { strategyRouter } from "@/server/routers/strategy";

const PLAN = "11111111-1111-4111-8111-111111111111";
const NODE = "22222222-2222-4222-8222-222222222222";
const caller = () => strategyRouter.createCaller({ session: { user: { id: NODE } }, cookieHeader: "session=real" } as never);

describe("Strategy Explorer backend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads persisted hierarchy, relationships, and staged changes", async () => {
    calls.nodes.mockResolvedValue([{ id: NODE, planVersionId: PLAN }]);
    calls.edges.mockResolvedValue([{ id: "edge-1", fromNodeId: NODE }]);
    calls.staged.mockResolvedValue([{ id: "stage-1", status: "pending" }]);
    await expect(caller().nodes()).resolves.toHaveLength(1);
    await expect(caller().edges({ planVersionId: PLAN })).resolves.toHaveLength(1);
    await expect(caller().stagedChanges({ planVersionId: PLAN })).resolves.toHaveLength(1);
  });

  it("loads node detail and traversal from the backend", async () => {
    calls.node.mockResolvedValue({ id: NODE, nameEn: "Persisted objective" });
    calls.trace.mockResolvedValue({ nodeId: NODE, ancestry: [], cascade: [{ id: NODE }] });
    await expect(caller().node({ nodeId: NODE })).resolves.toMatchObject({ id: NODE });
    await expect(caller().trace({ nodeId: NODE })).resolves.toMatchObject({ cascade: [{ id: NODE }] });
  });

  it("persists structural writes and propagates backend validation errors", async () => {
    calls.createNode.mockResolvedValue({ id: NODE, state: "draft" });
    await caller().createNode({ type: "objective", nameEn: "Objective", nameAr: "هدف", planVersionId: PLAN });
    expect(calls.createNode).toHaveBeenCalledOnce();
    calls.linkEdge.mockRejectedValueOnce(new Error("Strategy relationship violates cardinality"));
    await expect(caller().linkEdge({ fromNodeId: NODE, toNodeId: "33333333-3333-4333-8333-333333333333", edgeType: "contains", planVersionId: PLAN }))
      .rejects.toThrow("cardinality");
  });
});
