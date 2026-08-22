import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the Strategy Hierarchy tRPC surface.
 *
 * The service is mocked so a failure here is unambiguously a router problem —
 * who may call it, what input it accepts, and what a caller is told when the
 * service rejects.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const nodeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const parentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const session = {
  user: { id: userId, email: "owner@example.test", name: "KPI Owner" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const getTree = vi.fn();
const createNode = vi.fn();
const updateNode = vi.fn();
const deleteNode = vi.fn();

function context(sessionOverride: typeof session | null = session) {
  return {
    health: { check: vi.fn() },
    credentials: { authenticate: vi.fn() },
    loginRateLimiter: { consume: vi.fn(), reset: vi.fn() },
    clientIp: "127.0.0.1",
    session: sessionOverride,
    oidcIdentities: { reconcile: vi.fn() },
    auditTap: { recordCompletedCall: vi.fn() },
    authenticationFreshness: { record: vi.fn() },
    authorization: { resolve },
    iam: { getStepUpPolicy: vi.fn() },
    rules: {},
    audit: {},
    registry: {},
    strategyHierarchy: { getTree, createNode, updateNode, deleteNode },
  };
}

function authorization(roles: string[]) {
  return { userId, roles, scopeGrants: [], authenticatedAt: new Date() };
}

const nodeOutput = {
  id: nodeId,
  parentId: null,
  name: "Acme Corp 2025 Strategic Plan",
  type: "plan" as const,
  status: "on-track" as const,
  progress: 74,
  owner: { name: "Alex Morgan", initials: "AM", color: "bg-indigo-500" },
  budget: "$12.4M",
  startDate: new Date("2025-01-01"),
  endDate: new Date("2025-12-01"),
  description: "Our comprehensive corporate strategy.",
  linkedKpis: ["Revenue Growth"],
  createdAt: new Date(),
  activity: [],
  children: [],
};

const validCreateInput = {
  parentId,
  name: "Enterprise Sales Acceleration",
  type: "initiative" as const,
  status: "at-risk" as const,
  progress: 63,
  ownerName: "Tom Reyes",
};

describe("strategyHierarchy tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["seo_administrator"]));
    getTree.mockResolvedValue(nodeOutput);
    createNode.mockResolvedValue(nodeOutput);
    updateNode.mockResolvedValue(nodeOutput);
    deleteNode.mockResolvedValue({ deleted: true });
  });

  describe("authentication", () => {
    it("refuses every procedure without a session", async () => {
      const caller = rootRouter.createCaller(context(null) as never);

      await expect(caller.strategyHierarchy.tree()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.strategyHierarchy.create(validCreateInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.strategyHierarchy.update({ id: nodeId, progress: 10 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.strategyHierarchy.delete({ id: nodeId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("authorization", () => {
    it("allows any authenticated caller to read the tree", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyHierarchy.tree()).resolves.toEqual(nodeOutput);
    });

    it("refuses create/update/delete without seo_administrator", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyHierarchy.create(validCreateInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.strategyHierarchy.update({ id: nodeId, progress: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.strategyHierarchy.delete({ id: nodeId })).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(createNode).not.toHaveBeenCalled();
      expect(updateNode).not.toHaveBeenCalled();
      expect(deleteNode).not.toHaveBeenCalled();
    });

    it("allows create/update/delete for seo_administrator", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyHierarchy.create(validCreateInput)).resolves.toEqual(nodeOutput);
      await expect(caller.strategyHierarchy.update({ id: nodeId, progress: 10 })).resolves.toEqual(nodeOutput);
      await expect(caller.strategyHierarchy.delete({ id: nodeId })).resolves.toEqual({ deleted: true });
    });
  });

  describe("input validation", () => {
    it("rejects unknown fields on create", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyHierarchy.create({ ...validCreateInput, notAField: true } as never),
      ).rejects.toBeTruthy();
      expect(createNode).not.toHaveBeenCalled();
    });

    it("rejects progress outside 0-100", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyHierarchy.create({ ...validCreateInput, progress: 150 }),
      ).rejects.toBeTruthy();
      expect(createNode).not.toHaveBeenCalled();
    });

    it("rejects an invalid status enum value", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.strategyHierarchy.create({ ...validCreateInput, status: "done" as never }),
      ).rejects.toBeTruthy();
      expect(createNode).not.toHaveBeenCalled();
    });
  });

  describe("happy path wiring", () => {
    it("forwards the actor's identity from the session into create", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await caller.strategyHierarchy.create(validCreateInput);

      expect(createNode).toHaveBeenCalledWith(
        expect.objectContaining({
          ...validCreateInput,
          actorUserId: userId,
          actorName: "KPI Owner",
        }),
      );
    });

    it("splits id from the rest of the patch on update", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await caller.strategyHierarchy.update({ id: nodeId, progress: 42, status: "on-track" });

      expect(updateNode).toHaveBeenCalledWith(
        expect.objectContaining({
          id: nodeId,
          patch: { progress: 42, status: "on-track" },
          actorUserId: userId,
        }),
      );
    });
  });

  describe("error mapping", () => {
    it("maps a service rejection to BAD_REQUEST", async () => {
      deleteNode.mockRejectedValue(new Error("Cannot delete the root node"));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.strategyHierarchy.delete({ id: nodeId })).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Cannot delete the root node",
      });
    });
  });
});
