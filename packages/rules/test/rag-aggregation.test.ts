import { describe, expect, it } from "vitest";

import {
  evaluateRagAggregation,
  ragAggregationRuleSchema,
  type RagAggregationRule,
} from "../src";

describe("ragAggregationRuleSchema", () => {
  it("accepts worst-child-wins", () => {
    expect(
      ragAggregationRuleSchema.parse({
        ruleType: "rag_aggregation",
        method: "worst_child_wins",
      }),
    ).toBeDefined();
  });

  it("accepts weighted-count", () => {
    expect(
      ragAggregationRuleSchema.parse({
        ruleType: "rag_aggregation",
        method: "weighted_count",
        watchThreshold: 0.25,
        offTrackThreshold: 0.6,
      }),
    ).toBeDefined();
  });

  it("rejects reversed thresholds", () => {
    expect(() =>
      ragAggregationRuleSchema.parse({
        ruleType: "rag_aggregation",
        method: "weighted_count",
        watchThreshold: 0.8,
        offTrackThreshold: 0.5,
      }),
    ).toThrow();
  });

  it("rejects unknown executable properties", () => {
    expect(() =>
      ragAggregationRuleSchema.parse({
        ruleType: "rag_aggregation",
        method: "worst_child_wins",
        expression: "process.exit()",
      }),
    ).toThrow();
  });
});

describe("evaluateRagAggregation", () => {
  const worstChildRule: RagAggregationRule = {
    ruleType: "rag_aggregation",
    method: "worst_child_wins",
  };

  it("returns on-track when every child is on-track", () => {
    expect(
      evaluateRagAggregation(worstChildRule, {
        children: [
          { id: "a", status: "on_track" },
          { id: "b", status: "on_track" },
        ],
      }),
    ).toEqual({
      status: "on_track",
      score: 0,
    });
  });

  it("returns watch when watch is the worst child", () => {
    expect(
      evaluateRagAggregation(worstChildRule, {
        children: [
          { id: "a", status: "on_track" },
          { id: "b", status: "watch" },
        ],
      }),
    ).toEqual({
      status: "watch",
      score: 0.5,
    });
  });

  it("returns off-track when any child is off-track", () => {
    expect(
      evaluateRagAggregation(worstChildRule, {
        children: [
          { id: "a", status: "on_track" },
          { id: "b", status: "watch" },
          { id: "c", status: "off_track" },
        ],
      }),
    ).toEqual({
      status: "off_track",
      score: 1,
    });
  });

  it("calculates a weighted-count result", () => {
    const rule: RagAggregationRule = {
      ruleType: "rag_aggregation",
      method: "weighted_count",
      watchThreshold: 0.25,
      offTrackThreshold: 0.75,
    };

    const result = evaluateRagAggregation(rule, {
      children: [
        { id: "a", status: "on_track", weight: 1 },
        { id: "b", status: "watch", weight: 1 },
        { id: "c", status: "off_track", weight: 2 },
      ],
    });

    expect(result.score).toBeCloseTo(0.625);
    expect(result.status).toBe("watch");
  });

  it("uses a default weight of one", () => {
    const rule: RagAggregationRule = {
      ruleType: "rag_aggregation",
      method: "weighted_count",
      watchThreshold: 0.25,
      offTrackThreshold: 0.75,
    };

    expect(
      evaluateRagAggregation(rule, {
        children: [
          { id: "a", status: "on_track" },
          { id: "b", status: "watch" },
        ],
      }),
    ).toEqual({
      status: "watch",
      score: 0.25,
    });
  });

  it("treats an exact watch threshold as watch", () => {
    const rule: RagAggregationRule = {
      ruleType: "rag_aggregation",
      method: "weighted_count",
      watchThreshold: 0.5,
      offTrackThreshold: 0.8,
    };

    expect(
      evaluateRagAggregation(rule, {
        children: [
          { id: "a", status: "off_track" },
          { id: "b", status: "on_track" },
        ],
      }).status,
    ).toBe("watch");
  });

  it("treats an exact off-track threshold as off-track", () => {
    const rule: RagAggregationRule = {
      ruleType: "rag_aggregation",
      method: "weighted_count",
      watchThreshold: 0.25,
      offTrackThreshold: 0.5,
    };

    expect(
      evaluateRagAggregation(rule, {
        children: [
          { id: "a", status: "off_track" },
          { id: "b", status: "on_track" },
        ],
      }).status,
    ).toBe("off_track");
  });
});
