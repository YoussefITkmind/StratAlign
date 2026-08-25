import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiStrategyNotFoundError } from "../../src/modules/ai/ai.errors";
import { StrategyBriefCollector } from "../../src/modules/ai/strategy-brief.collector";
import type { PrismaService } from "../../src/database/prisma.service";
import type {
  NodeStatus,
  NodeType,
  StrategyHierarchyNodeRecord,
} from "../../src/modules/strategy-hierarchy/strategy-hierarchy.service";

/**
 * The collector is the only thing that decides what a model is allowed to see,
 * and every factual number in a published brief comes from here rather than
 * from the model. These tests therefore pin two things: that the counts and
 * attributions are computed from the real tree, and that missing data degrades
 * to an honest absence rather than to a plausible-looking figure.
 */

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const THEME_ID = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE_ID = "33333333-3333-4333-8333-333333333333";
const OBJECTIVE_TWO_ID = "44444444-4444-4444-8444-444444444444";

/** Fixed so overdue detection is a property of the fixture, not of the clock. */
const NOW = new Date("2026-08-25T00:00:00.000Z");

interface NodeOptions {
  id: string;
  name: string;
  type: NodeType;
  status?: NodeStatus;
  progress?: number;
  ownerName?: string;
  description?: string | null;
  endDate?: Date | null;
  linkedKpis?: string[];
  children?: StrategyHierarchyNodeRecord[];
}

function node(options: NodeOptions): StrategyHierarchyNodeRecord {
  const ownerName = options.ownerName ?? "Alex Morgan";
  return {
    id: options.id,
    parentId: null,
    name: options.name,
    type: options.type,
    status: options.status ?? "on-track",
    progress: options.progress ?? 50,
    owner: { name: ownerName, initials: "AM", color: "bg-indigo-500" },
    budget: null,
    startDate: null,
    endDate: options.endDate ?? null,
    description: options.description ?? null,
    linkedKpis: options.linkedKpis ?? [],
    createdAt: new Date("2026-01-01"),
    activity: [],
    children: options.children ?? [],
  };
}

interface PrismaStub {
  okr: { findMany: ReturnType<typeof vi.fn> };
  alignment: { findMany: ReturnType<typeof vi.fn> };
}

describe("strategy brief collector", () => {
  let prisma: PrismaStub;
  let getTree: ReturnType<typeof vi.fn>;
  let collector: StrategyBriefCollector;

  function build(tree: StrategyHierarchyNodeRecord | null): void {
    getTree.mockResolvedValue(tree);
  }

  beforeEach(() => {
    prisma = {
      okr: { findMany: vi.fn().mockResolvedValue([]) },
      alignment: { findMany: vi.fn().mockResolvedValue([]) },
    };
    getTree = vi.fn();
    collector = new StrategyBriefCollector(
      prisma as unknown as PrismaService,
      { getTree },
      () => NOW,
    );
  });

  const fullTree = () =>
    node({
      id: ROOT_ID,
      name: "Acme Corp 2025 Strategic Plan",
      type: "plan",
      progress: 74,
      description: "Sustainable value creation through focused execution.",
      children: [
        node({
          id: THEME_ID,
          name: "Revenue & Growth",
          type: "perspective",
          status: "at-risk",
          progress: 58,
          children: [
            node({
              id: OBJECTIVE_ID,
              name: "Drive Revenue Growth 40% YoY",
              type: "objective",
              progress: 67,
              ownerName: "Sarah Chen",
              linkedKpis: ["Revenue Growth"],
            }),
            node({
              id: OBJECTIVE_TWO_ID,
              name: "Improve Gross Margin to 72%",
              type: "objective",
              progress: 70,
              ownerName: "Sarah Chen",
            }),
          ],
        }),
      ],
    });

  describe("missing strategy", () => {
    it("refuses when the hierarchy is empty", async () => {
      build(null);

      await expect(collector.collect()).rejects.toBeInstanceOf(AiStrategyNotFoundError);
    });

    it("refuses a root id that is not the current root", async () => {
      build(fullTree());

      await expect(collector.collect(OBJECTIVE_ID)).rejects.toBeInstanceOf(
        AiStrategyNotFoundError,
      );
    });

    it("accepts the real root id", async () => {
      build(fullTree());

      await expect(collector.collect(ROOT_ID)).resolves.toMatchObject({ rootNodeId: ROOT_ID });
    });
  });

  describe("themes and objectives", () => {
    it("counts each theme's objectives from the real tree", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.themes).toEqual([
        expect.objectContaining({ id: THEME_ID, name: "Revenue & Growth", objectiveCount: 2 }),
      ]);
    });

    it("attributes each objective to its nearest ancestor theme", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.objectives).toHaveLength(2);
      expect(snapshot.objectives[0]).toMatchObject({
        id: OBJECTIVE_ID,
        name: "Drive Revenue Growth 40% YoY",
        themeId: THEME_ID,
        themeName: "Revenue & Growth",
        owner: "Sarah Chen",
        progress: 67,
      });
    });

    it("uses the plan's own description as the vision", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.vision).toBe("Sustainable value creation through focused execution.");
    });

    it("reports no vision when the plan has no description", async () => {
      build(node({ id: ROOT_ID, name: "Plan", type: "plan", description: null }));

      const snapshot = await collector.collect();

      expect(snapshot.vision).toBeNull();
    });
  });

  describe("measurable progress", () => {
    it("counts attached OKRs and KPI alignments towards an objective's measures", async () => {
      build(fullTree());
      prisma.okr.findMany.mockResolvedValue([{ objectiveNodeId: OBJECTIVE_TWO_ID }]);
      prisma.alignment.findMany.mockResolvedValue([{ strategyNodeId: OBJECTIVE_TWO_ID }]);

      const snapshot = await collector.collect();

      // One linked KPI label on the node itself.
      expect(snapshot.objectives[0]!.measureCount).toBe(1);
      // One OKR plus one alignment from the mirrored strategy node.
      expect(snapshot.objectives[1]!.measureCount).toBe(2);
      expect(snapshot.measuredObjectiveCount).toBe(2);
    });

    it("reports no progress rather than 0% for an unstarted, unmeasured objective", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [
            node({
              id: THEME_ID,
              name: "People & Culture",
              type: "perspective",
              children: [
                node({
                  id: OBJECTIVE_ID,
                  name: "Not started yet",
                  type: "objective",
                  status: "not-started",
                  progress: 0,
                }),
              ],
            }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.objectives[0]!.progress).toBeNull();
      expect(snapshot.measuredObjectiveCount).toBe(0);
    });

    it("keeps a real 0% when the objective has something measurable attached", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [
            node({
              id: THEME_ID,
              name: "People & Culture",
              type: "perspective",
              children: [
                node({
                  id: OBJECTIVE_ID,
                  name: "Measured but not started",
                  type: "objective",
                  status: "not-started",
                  progress: 0,
                  linkedKpis: ["Engagement Score"],
                }),
              ],
            }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.objectives[0]!.progress).toBe(0);
    });
  });

  describe("missing owners", () => {
    it("reports an absent owner as null rather than inventing one", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [
            node({
              id: THEME_ID,
              name: "Customer Excellence",
              type: "perspective",
              children: [
                node({
                  id: OBJECTIVE_ID,
                  name: "Achieve NPS 70+",
                  type: "objective",
                  ownerName: "   ",
                }),
              ],
            }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.objectives[0]!.owner).toBeNull();
      expect(snapshot.riskSignals).toContainEqual(
        expect.objectContaining({ kind: "unowned_objective", nodeId: OBJECTIVE_ID }),
      );
    });
  });

  describe("risk signals", () => {
    it("raises a signal for an at-risk theme and names its area", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.riskSignals).toContainEqual(
        expect.objectContaining({
          kind: "at_risk_theme",
          area: "Revenue & Growth",
          nodeId: THEME_ID,
        }),
      );
    });

    it("raises a signal for an objective with no KPI or OKR attached", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.riskSignals).toContainEqual(
        expect.objectContaining({
          kind: "unmeasured_objective",
          nodeId: OBJECTIVE_TWO_ID,
          area: "Revenue & Growth",
        }),
      );
    });

    it("raises a signal for a node past its end date and short of 100%", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [
            node({
              id: THEME_ID,
              name: "Engineering Excellence",
              type: "perspective",
              endDate: new Date("2026-01-31"),
              progress: 40,
            }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.riskSignals).toContainEqual(
        expect.objectContaining({ kind: "overdue_node", nodeId: THEME_ID }),
      );
    });

    it("raises nothing when every node is on track, owned, and measured", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [
            node({
              id: THEME_ID,
              name: "Revenue & Growth",
              type: "perspective",
              children: [
                node({
                  id: OBJECTIVE_ID,
                  name: "Drive Revenue Growth",
                  type: "objective",
                  linkedKpis: ["Revenue Growth"],
                }),
              ],
            }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.riskSignals).toEqual([]);
    });
  });

  describe("insufficient data", () => {
    it("flags a hierarchy with no themes and no objectives", async () => {
      build(node({ id: ROOT_ID, name: "Empty Plan", type: "plan" }));

      const snapshot = await collector.collect();

      expect(snapshot.insufficientData).toBe(true);
      expect(snapshot.insufficientDataReason).toContain("no themes or objectives");
    });

    it("flags a hierarchy with themes but no objectives", async () => {
      build(
        node({
          id: ROOT_ID,
          name: "Plan",
          type: "plan",
          children: [node({ id: THEME_ID, name: "Revenue & Growth", type: "perspective" })],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.insufficientData).toBe(true);
      expect(snapshot.insufficientDataReason).toContain("no objectives");
    });

    it("does not flag a hierarchy that has objectives", async () => {
      build(fullTree());

      const snapshot = await collector.collect();

      expect(snapshot.insufficientData).toBe(false);
      expect(snapshot.insufficientDataReason).toBeNull();
    });

    it("does not query for measures when there are no objectives to measure", async () => {
      build(node({ id: ROOT_ID, name: "Empty Plan", type: "plan" }));

      await collector.collect();

      expect(prisma.okr.findMany).not.toHaveBeenCalled();
      expect(prisma.alignment.findMany).not.toHaveBeenCalled();
    });
  });

  describe("bounding", () => {
    it("caps the objectives handed to the model while still counting the whole tree", async () => {
      const objectives = Array.from({ length: 60 }, (_, index) =>
        node({
          id: `objective-${index}`,
          name: `Objective ${index}`,
          type: "objective",
          linkedKpis: ["A KPI"],
        }),
      );
      build(
        node({
          id: ROOT_ID,
          name: "Large Plan",
          type: "plan",
          children: [
            node({ id: THEME_ID, name: "Everything", type: "perspective", children: objectives }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.objectives).toHaveLength(40);
      expect(snapshot.themes[0]!.objectiveCount).toBe(60);
      expect(snapshot.totalNodes).toBe(62);
    });

    it("caps the risk signals handed to the model", async () => {
      const objectives = Array.from({ length: 40 }, (_, index) =>
        node({
          id: `objective-${index}`,
          name: `Objective ${index}`,
          type: "objective",
          ownerName: "",
        }),
      );
      build(
        node({
          id: ROOT_ID,
          name: "Large Plan",
          type: "plan",
          children: [
            node({ id: THEME_ID, name: "Everything", type: "perspective", children: objectives }),
          ],
        }),
      );

      const snapshot = await collector.collect();

      expect(snapshot.riskSignals.length).toBeLessThanOrEqual(24);
    });
  });
});
