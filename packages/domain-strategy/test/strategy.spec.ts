import { describe, expect, it } from "vitest";
import {
  CrossPlanVersionRelationshipError,
  InvalidStrategyRelationshipError,
  assertNodeStateTransition,
  assertRelationshipAllowed,
  canTransitionNodeState,
  isRelationshipAllowed,
  validateEdge,
} from "../src";

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
      { type: "theme", planVersionId: "11111111-1111-4111-8111-111111111111" },
      { type: "objective", planVersionId: "22222222-2222-4222-8222-222222222222" },
      "contains",
    )).toThrow(CrossPlanVersionRelationshipError);
  });
});

describe("strategy node lifecycle", () => {
  it("allows forward-only lifecycle transitions", () => {
    expect(canTransitionNodeState("draft", "active")).toBe(true);
    expect(canTransitionNodeState("active", "retired")).toBe(true);
    expect(canTransitionNodeState("retired", "active")).toBe(false);
    expect(() => assertNodeStateTransition("retired", "draft")).toThrow();
  });
});
