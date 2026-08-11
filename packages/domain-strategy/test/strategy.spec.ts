import { describe, expect, it } from "vitest";
import {
  CrossPlanVersionRelationshipError,
  InvalidStrategyRelationshipError,
  RelationshipCardinalityError,
  StrategyCycleError,
  assertAcyclic,
  assertNodeStateTransition,
  assertPlanVersionStateTransition,
  assertRelationshipAllowed,
  assertRelationshipCardinality,
  canTransitionNodeState,
  canTransitionPlanVersionState,
  hasDirectedCycle,
  isRelationshipAllowed,
  validateEdge,
  validateGraph,
  type StrategyEdge,
  type StrategyNode,
} from "../src";

const planVersionId = "11111111-1111-4111-8111-111111111111";
const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const now = new Date("2026-08-11T00:00:00Z");

function node(id: string, type: StrategyNode["type"]): StrategyNode {
  return {
    id,
    type,
    nameEn: type,
    nameAr: type,
    planVersionId,
    state: "draft",
    createdBy: actorId,
    createdAt: now,
  };
}

function edge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  edgeType: StrategyEdge["edgeType"],
): StrategyEdge {
  return { id, fromNodeId, toNodeId, edgeType, planVersionId };
}

describe("strategy relationship rules", () => {
  it("allows the canonical strategy hierarchy", () => {
    expect(isRelationshipAllowed("corporate_strategy", "theme", "contains")).toBe(true);
    expect(isRelationshipAllowed("theme", "objective", "contains")).toBe(true);
    expect(isRelationshipAllowed("objective", "strategic_play", "executed_by")).toBe(true);
    expect(isRelationshipAllowed("strategic_play", "portfolio", "belongs_to_portfolio")).toBe(true);
    expect(isRelationshipAllowed("strategic_play", "area_of_focus", "aligns_to")).toBe(true);
  });

  it("rejects links that are not configured", () => {
    expect(() => assertRelationshipAllowed("portfolio", "corporate_strategy", "contains"))
      .toThrow(InvalidStrategyRelationshipError);
  });

  it("rejects cross-plan-version edges", () => {
    expect(() => validateEdge(
      { type: "theme", planVersionId },
      { type: "objective", planVersionId: "22222222-2222-4222-8222-222222222222" },
      "contains",
    )).toThrow(CrossPlanVersionRelationshipError);
  });

  it("enforces configured min/max cardinality", () => {
    const rule = assertRelationshipAllowed("strategic_play", "portfolio", "belongs_to_portfolio");
    expect(() => assertRelationshipCardinality(rule, 1)).not.toThrow();
    expect(() => assertRelationshipCardinality(rule, 2)).toThrow(RelationshipCardinalityError);
  });
});

describe("strategy graph validation", () => {
  it("detects directed cycles", () => {
    const edges = [
      { fromNodeId: "a", toNodeId: "b" },
      { fromNodeId: "b", toNodeId: "c" },
      { fromNodeId: "c", toNodeId: "a" },
    ];
    expect(hasDirectedCycle(edges)).toBe(true);
    expect(() => assertAcyclic(edges)).toThrow(StrategyCycleError);
  });

  it("accepts a complete valid hierarchy", () => {
    const nodes = [
      node("11111111-1111-4111-8111-111111111111", "corporate_strategy"),
      node("22222222-2222-4222-8222-222222222222", "theme"),
      node("33333333-3333-4333-8333-333333333333", "objective"),
    ];
    const edges = [
      edge("44444444-4444-4444-8444-444444444444", nodes[0]!.id, nodes[1]!.id, "contains"),
      edge("55555555-5555-4555-8555-555555555555", nodes[1]!.id, nodes[2]!.id, "contains"),
    ];
    expect(() => validateGraph(nodes, edges)).not.toThrow();
  });

  it("rejects a hierarchy that misses a required child", () => {
    const nodes = [node("11111111-1111-4111-8111-111111111111", "corporate_strategy")];
    expect(() => validateGraph(nodes, [])).toThrow(RelationshipCardinalityError);
  });
});

describe("strategy lifecycle", () => {
  it("allows forward-only node lifecycle transitions", () => {
    expect(canTransitionNodeState("draft", "active")).toBe(true);
    expect(canTransitionNodeState("active", "retired")).toBe(true);
    expect(canTransitionNodeState("retired", "active")).toBe(false);
    expect(() => assertNodeStateTransition("retired", "draft")).toThrow();
  });

  it("allows forward-only plan version lifecycle transitions", () => {
    expect(canTransitionPlanVersionState("draft", "active")).toBe(true);
    expect(canTransitionPlanVersionState("active", "retired")).toBe(true);
    expect(canTransitionPlanVersionState("retired", "draft")).toBe(false);
    expect(() => assertPlanVersionStateTransition("retired", "active")).toThrow();
  });
});
