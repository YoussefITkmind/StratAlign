import { beforeEach, describe, expect, it, vi } from "vitest";

import { StrategyNodeBridgeService } from "../../src/modules/strategy-hierarchy/strategy-node-bridge.service";
import type { PrismaService } from "../../src/database/prisma.service";

/**
 * The bridge is the only thing connecting the Strategy Hierarchy page's tree
 * (StrategyHierarchyNode) to the graph AI-suggestion and every real KPI/OKR
 * actually depend on (StrategyNode/StrategyEdge). These tests pin down what
 * gets mirrored, what doesn't, and that mirroring never blocks the Add Node
 * flow it hangs off of.
 */

const PLAN_VERSION_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSPECTIVE_ID = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE_ID = "33333333-3333-4333-8333-333333333333";

interface PrismaStub {
  planVersion: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  strategyNode: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
  strategyEdge: { upsert: ReturnType<typeof vi.fn> };
  strategyHierarchyNode: { findMany: ReturnType<typeof vi.fn> };
}

function makePrisma(): PrismaStub {
  return {
    planVersion: { findFirst: vi.fn(), create: vi.fn() },
    strategyNode: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    strategyEdge: { upsert: vi.fn() },
    strategyHierarchyNode: { findMany: vi.fn() },
  };
}

describe("StrategyNodeBridgeService", () => {
  let prisma: PrismaStub;
  let bridge: StrategyNodeBridgeService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.planVersion.findFirst.mockResolvedValue({ id: PLAN_VERSION_ID });
    bridge = new StrategyNodeBridgeService(prisma as unknown as PrismaService);
  });

  describe("syncNode — perspective", () => {
    it("mirrors a perspective into a theme StrategyNode with the same id", async () => {
      await bridge.syncNode({ id: PERSPECTIVE_ID, parentId: null, name: "Revenue & Growth", type: "perspective", createdBy: USER_ID });

      expect(prisma.strategyNode.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PERSPECTIVE_ID },
          create: expect.objectContaining({
            id: PERSPECTIVE_ID,
            type: "THEME",
            nameEn: "Revenue & Growth",
            nameAr: "Revenue & Growth",
            planVersionId: PLAN_VERSION_ID,
            state: "ACTIVE",
            createdBy: USER_ID,
          }),
        }),
      );
    });

    it("reuses an existing bridge plan version instead of creating a new one every call", async () => {
      await bridge.syncNode({ id: PERSPECTIVE_ID, parentId: null, name: "Revenue & Growth", type: "perspective", createdBy: USER_ID });
      await bridge.syncNode({ id: OBJECTIVE_ID, parentId: null, name: "Something Else", type: "perspective", createdBy: USER_ID });

      expect(prisma.planVersion.create).not.toHaveBeenCalled();
    });

    it("creates the bridge plan version once when none exists yet", async () => {
      prisma.planVersion.findFirst.mockResolvedValue(null);
      prisma.planVersion.create.mockResolvedValue({ id: PLAN_VERSION_ID });

      await bridge.syncNode({ id: PERSPECTIVE_ID, parentId: null, name: "Revenue & Growth", type: "perspective", createdBy: USER_ID });

      expect(prisma.planVersion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT" }) }),
      );
    });
  });

  describe("syncNode — objective", () => {
    it("mirrors an objective and links it to its already-mirrored parent perspective", async () => {
      prisma.strategyNode.findUnique.mockResolvedValue({ id: PERSPECTIVE_ID, type: "THEME" });

      await bridge.syncNode({ id: OBJECTIVE_ID, parentId: PERSPECTIVE_ID, name: "Drive Revenue Growth 40% YoY", type: "objective", createdBy: USER_ID });

      expect(prisma.strategyNode.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ id: OBJECTIVE_ID, type: "OBJECTIVE" }),
        }),
      );
      expect(prisma.strategyEdge.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            fromNodeId: PERSPECTIVE_ID,
            toNodeId: OBJECTIVE_ID,
            edgeType: "CONTAINS",
            planVersionId: PLAN_VERSION_ID,
          },
        }),
      );
    });

    it("skips silently when the parent perspective has no mirror yet", async () => {
      prisma.strategyNode.findUnique.mockResolvedValue(null);

      await bridge.syncNode({ id: OBJECTIVE_ID, parentId: PERSPECTIVE_ID, name: "Orphaned Objective", type: "objective", createdBy: USER_ID });

      expect(prisma.strategyNode.upsert).not.toHaveBeenCalled();
      expect(prisma.strategyEdge.upsert).not.toHaveBeenCalled();
    });

    it("does nothing for a root-level objective (no parent at all)", async () => {
      await bridge.syncNode({ id: OBJECTIVE_ID, parentId: null, name: "Root Objective", type: "objective", createdBy: USER_ID });

      expect(prisma.strategyNode.findUnique).not.toHaveBeenCalled();
      expect(prisma.strategyNode.upsert).not.toHaveBeenCalled();
    });
  });

  describe("syncNode — unmirrored types", () => {
    it.each(["plan", "initiative", "project"] as const)("does nothing for a %s node", async (type) => {
      await bridge.syncNode({ id: PERSPECTIVE_ID, parentId: null, name: "Whatever", type, createdBy: USER_ID });

      expect(prisma.strategyNode.upsert).not.toHaveBeenCalled();
    });
  });

  describe("renameNode", () => {
    it("updates both name fields on an existing mirror", async () => {
      await bridge.renameNode(PERSPECTIVE_ID, "Customer Delight");

      expect(prisma.strategyNode.updateMany).toHaveBeenCalledWith({
        where: { id: PERSPECTIVE_ID },
        data: { nameEn: "Customer Delight", nameAr: "Customer Delight" },
      });
    });
  });

  describe("retireNode", () => {
    it("marks the mirror retired", async () => {
      await bridge.retireNode(PERSPECTIVE_ID);

      expect(prisma.strategyNode.updateMany).toHaveBeenCalledWith({
        where: { id: PERSPECTIVE_ID },
        data: { state: "RETIRED" },
      });
    });

    it("swallows a failure instead of throwing (e.g. referenced by a real KPI/OKR)", async () => {
      prisma.strategyNode.updateMany.mockRejectedValue(new Error("foreign key violation"));

      await expect(bridge.retireNode(PERSPECTIVE_ID)).resolves.toBeUndefined();
    });
  });

  describe("backfillAll", () => {
    it("syncs every perspective before any objective, so parent mirrors exist first", async () => {
      prisma.strategyHierarchyNode.findMany.mockImplementation(({ where }: { where: { type: string } }) =>
        where.type === "PERSPECTIVE"
          ? Promise.resolve([{ id: PERSPECTIVE_ID, parentId: null, name: "Revenue & Growth", createdBy: USER_ID }])
          : Promise.resolve([{ id: OBJECTIVE_ID, parentId: PERSPECTIVE_ID, name: "Drive Revenue Growth 40% YoY", createdBy: USER_ID }]),
      );
      // The objective's parent mirror "exists" the moment its own upsert has been called.
      prisma.strategyNode.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
        prisma.strategyNode.upsert.mock.calls.some((call) => call[0].create.id === where.id)
          ? Promise.resolve({ id: where.id })
          : Promise.resolve(null),
      );

      const result = await bridge.backfillAll();

      expect(result).toEqual({ perspectives: 1, objectives: 1 });
      expect(prisma.strategyEdge.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fromNodeId: PERSPECTIVE_ID, toNodeId: OBJECTIVE_ID }),
        }),
      );
    });
  });
});
