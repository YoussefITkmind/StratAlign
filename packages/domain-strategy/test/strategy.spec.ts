import { describe, expect, it } from "vitest";
import {
  CrossPlanVersionRelationshipError,
  DEFAULT_RELATIONSHIP_RULES,
  InvalidStrategyRelationshipError,
  RelationshipCardinalityError,
  StrategyCycleError,
  assertAcyclic,
  assertRelationshipAllowed,
  assertRelationshipCardinality,
  canTransitionNodeState,
  canTransitionPlanVersionState,
  validateEdge,
  validateGraph,
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
      fromType: "objective",
      toType: "strategic_play",
      edgeType: "executed_by",
      minCount: 1,
      maxCount: null,
    });
    expect(DEFAULT_RELATIONSHIP_RULES.some((rule) =>
      rule.fromType === "objective" &&
      rule.toType === "strategic_play" &&
      rule.edgeType === "aligns_to",
    )).toBe(false);
  });

  it("rejects invalid types and cross-plan edges", () => {
    expect(() => assertRelationshipAllowed("portfolio", "corporate_strategy", "contains"))
      .toThrow(InvalidStrategyRelationshipError);

    expect(() => validateEdge(
      { type: "theme", planVersionId },
      { type: "objective", planVersionId: "22222222-2222-4222-8222-222222222222" },
      "contains",
    )).toThrow(CrossPlanVersionRelationshipError);
  });

  it("enforces configured max cardinality", () => {
    const rule = assertRelationshipAllowed("strategic_play", "portfolio", "belongs_to_portfolio");
    expect(() => assertRelationshipCardinality(rule, 1)).not.toThrow();
    expect(() => assertRelationshipCardinality(rule, 2)).toThrow(RelationshipCardinalityError);
  });
});

describe("Prompt 2.1 graph validation", () => {
  it("detects a directed cycle", () => {
    expect(() => assertAcyclic([
      { fromNodeId: "a", toNodeId: "b" },
      { fromNodeId: "b", toNodeId: "c" },
      { fromNodeId: "c", toNodeId: "a" },
    ])).toThrow(StrategyCycleError);
  });

  it("enforces minimum cardinality for a complete graph", () => {
    const corporate = node("11111111-1111-4111-8111-111111111111", "corporate_strategy");
    const theme = node("22222222-2222-4222-8222-222222222222", "theme");
    const objective = node("33333333-3333-4333-8333-333333333333", "objective");
    const play = node("44444444-4444-4444-8444-444444444444", "strategic_play");

    expect(() => validateGraph([corporate], [])).toThrow(RelationshipCardinalityError);
    expect(() => validateGraph(
      [corporate, theme, objective, play],
      [
        edge("55555555-5555-4555-8555-555555555555", corporate.id, theme.id, "contains"),
        edge("66666666-6666-4666-8666-666666666666", theme.id, objective.id, "contains"),
        edge("77777777-7777-4777-8777-777777777777", objective.id, play.id, "executed_by"),
      ],
    )).not.toThrow();
  });
});

describe("Prompt 2.1 lifecycle", () => {
  it("keeps node and plan lifecycles forward-only", () => {
    expect(canTransitionNodeState("draft", "active")).toBe(true);
    expect(canTransitionNodeState("active", "retired")).toBe(true);
    expect(canTransitionNodeState("retired", "active")).toBe(false);
    expect(canTransitionPlanVersionState("draft", "active")).toBe(true);
    expect(canTransitionPlanVersionState("active", "closed")).toBe(true);
    expect(canTransitionPlanVersionState("closed", "active")).toBe(false);
  });
});
