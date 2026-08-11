import { describe, expect, it } from "vitest";
import {
  CrossPlanVersionRelationshipError,
  DEFAULT_RELATIONSHIP_RULES,
  InvalidStrategyRelationshipError,
  RelationshipCardinalityError,
  assertMinimumCardinality,
  assertRelationshipAllowed,
  canTransitionNodeState,
  canTransitionPlanVersionStatus,
  validateEdge,
  wouldCreateCycle,
  type StrategyEdge,
  type StrategyNode,
} from "../src";

const planVersionId = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-08-11T00:00:00Z");

function node(id: string, type: StrategyNode["type"]): StrategyNode {
  return { id, type, nameEn: type, nameAr: type, planVersionId, state: "draft", createdBy: actorId, createdAt: now };
}
function edge(id: string, fromNodeId: string, toNodeId: string, edgeType: StrategyEdge["edgeType"]): StrategyEdge {
  return { id, fromNodeId, toNodeId, edgeType, planVersionId };
}

describe("Prompt 2.1 relationship rules", () => {
  it("uses one authoritative objective-to-play rule", () => {
    expect(DEFAULT_RELATIONSHIP_RULES).toContainEqual({
      fromType: "objective", toType: "strategic_play", edgeType: "executed_by", minCount: 1, maxCount: null,
    });
    expect(DEFAULT_RELATIONSHIP_RULES.some((r) => r.fromType === "objective" && r.toType === "strategic_play" && r.edgeType === "aligns_to")).toBe(false);
  });

  it("rejects unconfigured types, cross-plan edges, and max cardinality", () => {
    expect(() => assertRelationshipAllowed("portfolio", "corporate_strategy", "contains")).toThrow(InvalidStrategyRelationshipError);
    expect(() => validateEdge(
      { type: "theme", planVersionId },
      { type: "objective", planVersionId: "22222222-2222-4222-8222-222222222222" },
      "contains",
    )).toThrow(CrossPlanVersionRelationshipError);
    expect(() => validateEdge(
      { type: "strategic_play", planVersionId },
      { type: "portfolio", planVersionId },
      "belongs_to_portfolio",
      1,
    )).toThrow(RelationshipCardinalityError);
  });
});

describe("Prompt 2.1 graph validation", () => {
  it("detects a proposed directed cycle", () => {
    expect(wouldCreateCycle("c", "a", [
      { fromNodeId: "a", toNodeId: "b" },
      { fromNodeId: "b", toNodeId: "c" },
    ])).toBe(true);
    expect(wouldCreateCycle("c", "d", [
      { fromNodeId: "a", toNodeId: "b" },
      { fromNodeId: "b", toNodeId: "c" },
    ])).toBe(false);
  });

  it("enforces minimum cardinality at plan activation time", () => {
    const corporate = node("11111111-1111-4111-8111-111111111111", "corporate_strategy");
    const theme = node("22222222-2222-4222-8222-222222222222", "theme");
    expect(() => assertMinimumCardinality([corporate], [])).toThrow(RelationshipCardinalityError);
    expect(() => assertMinimumCardinality([corporate, theme], [
      edge("33333333-3333-4333-8333-333333333333", corporate.id, theme.id, "contains"),
    ])).toThrow(RelationshipCardinalityError);
  });
});

describe("Prompt 2.1 lifecycle", () => {
  it("keeps node and plan lifecycles forward-only", () => {
    expect(canTransitionNodeState("draft", "active")).toBe(true);
    expect(canTransitionNodeState("active", "retired")).toBe(true);
    expect(canTransitionNodeState("retired", "active")).toBe(false);
    expect(canTransitionPlanVersionStatus("draft", "active")).toBe(true);
    expect(canTransitionPlanVersionStatus("active", "closed")).toBe(true);
    expect(canTransitionPlanVersionStatus("closed", "active")).toBe(false);
  });
});
