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
  tree: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
}));
vi.mock("@/server/backend-registry-client", () => ({
  createBackendRegistryClient: vi.fn(() => ({ strategyHierarchy: {
    tree: { query: calls.tree },
    create: { mutate: calls.create },
    update: { mutate: calls.update },
    delete: { mutate: calls.delete },
  } })),
  translateBackendRegistryError: (error: unknown) => { throw error; },
}));

import { strategyHierarchyRouter } from "@/server/routers/strategy-hierarchy";

const USER = "22222222-2222-4222-8222-222222222222";
const PARENT = "33333333-3333-4333-8333-333333333333";
const NODE = "44444444-4444-4444-8444-444444444444";
const caller = () => strategyHierarchyRouter.createCaller({ session: { user: { id: USER } }, cookieHeader: "session=real" } as never);

const validCreateInput = {
  parentId: PARENT,
  name: "Enterprise Sales Acceleration",
  type: "initiative" as const,
  status: "at-risk" as const,
  progress: 63,
  ownerName: "Tom Reyes",
};

describe("Strategy Hierarchy backend proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the persisted tree", async () => {
    calls.tree.mockResolvedValue({ id: NODE, name: "Acme Corp 2025 Strategic Plan" });
    await expect(caller().tree()).resolves.toMatchObject({ id: NODE });
  });

  it("persists a new node and propagates backend validation errors", async () => {
    calls.create.mockResolvedValue({ id: NODE });
    await caller().createNode(validCreateInput);
    expect(calls.create).toHaveBeenCalledWith(validCreateInput);

    calls.create.mockRejectedValueOnce(new Error("A root node already exists"));
    await expect(caller().createNode(validCreateInput)).rejects.toThrow("root node already exists");
  });

  it("forwards a partial update", async () => {
    calls.update.mockResolvedValue({ id: NODE, progress: 80 });
    await caller().updateNode({ id: NODE, progress: 80 });
    expect(calls.update).toHaveBeenCalledWith({ id: NODE, progress: 80 });
  });

  it("forwards delete", async () => {
    calls.delete.mockResolvedValue({ deleted: true });
    await expect(caller().deleteNode({ id: NODE })).resolves.toEqual({ deleted: true });
  });

  it("refuses every procedure without a session", async () => {
    const anonCaller = strategyHierarchyRouter.createCaller({ session: null, cookieHeader: null } as never);
    await expect(anonCaller.tree()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonCaller.createNode(validCreateInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
