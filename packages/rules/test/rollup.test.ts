import { describe, expect, it } from "vitest";

import {
  evaluateRollup,
  rollupRuleSchema,
  type RollupRule,
} from "../src";

const children = [
  { id: "a", value: 10 },
  { id: "b", value: 20 },
  { id: "c", value: 30 },
];

describe("rollupRuleSchema", () => {
  it("accepts all supported rollup methods", () => {
    expect(
      rollupRuleSchema.parse({
        ruleType: "rollup",
        method: "sum",
      }),
    ).toBeDefined();

    expect(
      rollupRuleSchema.parse({
        ruleType: "rollup",
        method: "average",
      }),
    ).toBeDefined();

    expect(
      rollupRuleSchema.parse({
        ruleType: "rollup",
        method: "weighted_average",
        weights: {
          a: 0.2,
          b: 0.3,
          c: 0.5,
        },
      }),
    ).toBeDefined();

    expect(
      rollupRuleSchema.parse({
        ruleType: "rollup",
        method: "worst_of",
        direction: "higher_is_better",
      }),
    ).toBeDefined();
  });

  it("rejects negative weights", () => {
    expect(() =>
      rollupRuleSchema.parse({
        ruleType: "rollup",
        method: "weighted_average",
        weights: {
          a: -1,
        },
      }),
    ).toThrow();
  });
});

describe("evaluateRollup", () => {
  it("calculates a sum", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "sum",
    };

    expect(evaluateRollup(rule, { children }).value).toBe(60);
  });

  it("calculates an average", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "average",
    };

    expect(evaluateRollup(rule, { children }).value).toBe(20);
  });

  it("calculates a weighted average", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "weighted_average",
      weights: {
        a: 0.2,
        b: 0.3,
        c: 0.5,
      },
    };

    expect(evaluateRollup(rule, { children }).value).toBe(23);
  });

  it("renormalizes weights after excluding null children", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "weighted_average",
      weights: {
        a: 0.25,
        b: 0.25,
        c: 0.5,
      },
    };

    const result = evaluateRollup(rule, {
      children: [
        { id: "a", value: 10 },
        { id: "b", value: null },
        { id: "c", value: 30 },
      ],
    });

    expect(result.value).toBeCloseTo(
      (10 * 0.25 + 30 * 0.5) / 0.75,
    );
    expect(result.excludedChildIds).toEqual(["b"]);
  });

  it("returns null when all children are null", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "sum",
    };

    expect(
      evaluateRollup(rule, {
        children: [
          { id: "a", value: null },
          { id: "b", value: null },
        ],
      }),
    ).toEqual({
      value: null,
      includedChildIds: [],
      excludedChildIds: ["a", "b"],
    });
  });

  it("returns the lowest value when higher is better", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "worst_of",
      direction: "higher_is_better",
    };

    expect(evaluateRollup(rule, { children }).value).toBe(10);
  });

  it("returns the highest value when lower is better", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "worst_of",
      direction: "lower_is_better",
    };

    expect(evaluateRollup(rule, { children }).value).toBe(30);
  });

  it("rejects a missing child weight", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "weighted_average",
      weights: {
        a: 1,
      },
    };

    expect(() =>
      evaluateRollup(rule, { children }),
    ).toThrow("Missing weight for child: b");
  });

  it("rejects a zero total weight", () => {
    const rule: RollupRule = {
      ruleType: "rollup",
      method: "weighted_average",
      weights: {
        a: 0,
        b: 0,
        c: 0,
      },
    };

    expect(() =>
      evaluateRollup(rule, { children }),
    ).toThrow("positive total weight");
  });
});
