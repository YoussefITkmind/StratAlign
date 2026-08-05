import { describe, expect, it } from "vitest";

import {
  evaluateVarianceAlert,
  varianceAlertRuleSchema,
  type VarianceAlertRule,
} from "../src";

describe("varianceAlertRuleSchema", () => {
  it("accepts a valid absolute variance rule", () => {
    expect(
      varianceAlertRuleSchema.parse({
        ruleType: "variance_alert",
        comparator: "gte",
        deltaType: "absolute",
        threshold: 10,
        direction: "either",
      }),
    ).toBeDefined();
  });

  it("rejects a negative threshold", () => {
    expect(() =>
      varianceAlertRuleSchema.parse({
        ruleType: "variance_alert",
        comparator: "gte",
        deltaType: "absolute",
        threshold: -1,
        direction: "either",
      }),
    ).toThrow();
  });

  it("rejects unknown executable properties", () => {
    expect(() =>
      varianceAlertRuleSchema.parse({
        ruleType: "variance_alert",
        comparator: "gte",
        deltaType: "absolute",
        threshold: 10,
        direction: "either",
        expression: "process.exit()",
      }),
    ).toThrow();
  });
});

describe("evaluateVarianceAlert", () => {
  it("detects a positive absolute variance", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "positive",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 120,
        baseline: 100,
      }),
    ).toEqual({
      alert: true,
      delta: 20,
      percentageDelta: 20,
      comparedValue: 20,
    });
  });

  it("does not alert for a negative delta in positive mode", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "positive",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 80,
        baseline: 100,
      }).alert,
    ).toBe(false);
  });

  it("detects a negative variance in negative mode", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "negative",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 80,
        baseline: 100,
      }),
    ).toEqual({
      alert: true,
      delta: -20,
      percentageDelta: -20,
      comparedValue: 20,
    });
  });

  it("uses the absolute delta in either mode", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 20,
      direction: "either",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 80,
        baseline: 100,
      }).alert,
    ).toBe(true);
  });

  it("handles an exact threshold boundary", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 20,
      direction: "either",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 120,
        baseline: 100,
      }).alert,
    ).toBe(true);
  });

  it("calculates percentage variance", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "percentage",
      threshold: 25,
      direction: "positive",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 150,
        baseline: 100,
      }),
    ).toEqual({
      alert: true,
      delta: 50,
      percentageDelta: 50,
      comparedValue: 50,
    });
  });

  it("supports a negative baseline", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "percentage",
      threshold: 50,
      direction: "positive",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: -50,
        baseline: -100,
      }).percentageDelta,
    ).toBe(50);
  });

  it("allows absolute variance when baseline is zero", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "either",
    };

    expect(
      evaluateVarianceAlert(rule, {
        actual: 20,
        baseline: 0,
      }),
    ).toEqual({
      alert: true,
      delta: 20,
      percentageDelta: null,
      comparedValue: 20,
    });
  });

  it("rejects percentage variance when baseline is zero", () => {
    const rule: VarianceAlertRule = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "percentage",
      threshold: 10,
      direction: "either",
    };

    expect(() =>
      evaluateVarianceAlert(rule, {
        actual: 20,
        baseline: 0,
      }),
    ).toThrow(
      "Percentage variance cannot be evaluated when baseline is zero",
    );
  });
});
