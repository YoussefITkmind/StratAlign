import { describe, expect, it } from "vitest";
import {
  buildCanonicalForest,
  getAllowedChildRelationships,
  relationshipForChild,
  type CanonicalStrategyEdge,
  type CanonicalStrategyNode,
} from "@/lib/canonicalStrategyHierarchy";

const planVersionId = "11111111-1111-4111-8111-111111111111";
const base = {
  planVersionId,
  state: "draft" as const,
  createdBy: "user-1",
  createdAt: "2026-08-26T00:00:00.000Z",
};

describe("canonical strategy hierarchy", () => {
  it("maps an objective child to a strategic play using executed_by", () => {
    expect(relationshipForChild("objective", "strategic_play")).toBe("executed_by");
    expect(getAllowedChildRelationships("objective")).toEqual([
      { type: "strategic_play", edgeType: "executed_by" },
    ]);
  });

  it("builds the canonical corporate strategy to strategic play chain", () => {
    const nodes: CanonicalStrategyNode[] = [
      { ...base, id: "10000000-0000-4000-8000-000000000001", type: "corporate_strategy", nameEn: "Corporate", nameAr: "Corporate" },
      { ...base, id: "10000000-0000-4000-8000-000000000002", type: "theme", nameEn: "Growth", nameAr: "Growth" },
      { ...base, id: "10000000-0000-4000-8000-000000000003", type: "objective", nameEn: "Expand", nameAr: "Expand" },
      { ...base, id: "10000000-0000-4000-8000-000000000004", type: "strategic_play", nameEn: "EMEA Expansion", nameAr: "EMEA Expansion" },
    ];
    const edges: CanonicalStrategyEdge[] = [
      { id: "20000000-0000-4000-8000-000000000001", fromNodeId: nodes[0]!.id, toNodeId: nodes[1]!.id, edgeType: "contains", planVersionId },
      { id: "20000000-0000-4000-8000-000000000002", fromNodeId: nodes[1]!.id, toNodeId: nodes[2]!.id, edgeType: "contains", planVersionId },
      { id: "20000000-0000-4000-8000-000000000003", fromNodeId: nodes[2]!.id, toNodeId: nodes[3]!.id, edgeType: "executed_by", planVersionId },
    ];

    const forest = buildCanonicalForest(nodes, edges);
    expect(forest).toHaveLength(1);
    expect(forest[0]!.children[0]!.children[0]!.children[0]!.type).toBe("strategic_play");
    expect(forest[0]!.children[0]!.children[0]!.children[0]!.relationshipFromParent).toBe("executed_by");
  });
});
