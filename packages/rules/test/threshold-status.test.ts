import { describe, expect, it } from "vitest";

import {
  evaluateThresholdStatus,
  thresholdStatusRuleSchema,
  type ThresholdStatusRule,
} from "../src";
import { goldenThresholdStatusRule } from "./fixtures/golden-rules";

const higherIsBetterRule: ThresholdStatusRule = goldenThresholdStatusRule;

describe("thresholdStatusRuleSchema", () => {
  it("accepts a valid threshold rule", () => {
    expect(
      thresholdStatusRuleSchema.parse(higherIsBetterRule),
    ).toEqual(higherIsBetterRule);
  });

  it("rejects a threshold rule with no bands", () => {
    expect(() =>
      thresholdStatusRuleSchema.parse({
        ruleType: "threshold_status",
        direction: "higher_is_better",
        bands: [],
      }),
    ).toThrow();
  });

  it("rejects unknown executable properties", () => {
    expect(() =>
      thresholdStatusRuleSchema.parse({
        ...higherIsBetterRule,
        expression: "process.exit()",
      }),
    ).toThrow();
  });
});

describe("evaluateThresholdStatus", () => {
  it("returns the first matching band", () => {
    expect(
      evaluateThresholdStatus(higherIsBetterRule, { value: 90 }),
    ).toEqual({
      label: "on_track",
      color: "green",
      matchedBandIndex: 0,
    });
  });

  it("handles an exact band boundary", () => {
    expect(
      evaluateThresholdStatus(higherIsBetterRule, { value: 80 }),
    ).toEqual({
      label: "on_track",
      color: "green",
      matchedBandIndex: 0,
    });
  });

  it("matches the middle band", () => {
    expect(
      evaluateThresholdStatus(higherIsBetterRule, { value: 60 }),
    ).toEqual({
      label: "watch",
      color: "amber",
      matchedBandIndex: 1,
    });
  });

  it("matches the final band", () => {
    expect(
      evaluateThresholdStatus(higherIsBetterRule, { value: 20 }),
    ).toEqual({
      label: "off_track",
      color: "red",
      matchedBandIndex: 2,
    });
  });

  it("supports lower-is-better rules", () => {
    const rule: ThresholdStatusRule = {
      ruleType: "threshold_status",
      direction: "lower_is_better",
      bands: [
        {
          label: "on_track",
          color: "green",
          comparator: "lte",
          value: 10,
        },
        {
          label: "watch",
          color: "amber",
          comparator: "lte",
          value: 20,
        },
        {
          label: "off_track",
          color: "red",
          comparator: "gt",
          value: 20,
        },
      ],
    };

    expect(evaluateThresholdStatus(rule, { value: 7 })).toEqual({
      label: "on_track",
      color: "green",
      matchedBandIndex: 0,
    });

    expect(evaluateThresholdStatus(rule, { value: 25 })).toEqual({
      label: "off_track",
      color: "red",
      matchedBandIndex: 2,
    });
  });

  it("throws when no band matches", () => {
    const incompleteRule: ThresholdStatusRule = {
      ruleType: "threshold_status",
      direction: "higher_is_better",
      bands: [
        {
          label: "on_track",
          color: "green",
          comparator: "gte",
          value: 80,
        },
      ],
    };

    expect(() =>
      evaluateThresholdStatus(incompleteRule, { value: 20 }),
    ).toThrow("No threshold band matched");
  });
});
