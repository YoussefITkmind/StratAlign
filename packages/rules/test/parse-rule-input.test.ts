import { describe, expect, it } from "vitest";

import {
  parseRuleInput,
  type RuleDocument,
} from "../src";

describe("parseRuleInput", () => {
  it("validates threshold-status input", () => {
    const rule: RuleDocument = {
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

    expect(
      parseRuleInput(rule, {
        value: 90,
      }),
    ).toEqual({
      value: 90,
    });
  });

  it("validates rollup input", () => {
    const rule: RuleDocument = {
      ruleType: "rollup",
      method: "sum",
    };

    expect(
      parseRuleInput(rule, {
        children: [
          {
            id: "a",
            value: 10,
          },
        ],
      }),
    ).toEqual({
      children: [
        {
          id: "a",
          value: 10,
        },
      ],
    });
  });

  it("validates variance-alert input", () => {
    const rule: RuleDocument = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "either",
    };

    expect(
      parseRuleInput(rule, {
        actual: 120,
        baseline: 100,
      }),
    ).toEqual({
      actual: 120,
      baseline: 100,
    });
  });

  it("validates RAG aggregation input", () => {
    const rule: RuleDocument = {
      ruleType: "rag_aggregation",
      method: "worst_child_wins",
    };

    expect(
      parseRuleInput(rule, {
        children: [
          {
            id: "a",
            status: "watch",
          },
        ],
      }),
    ).toEqual({
      children: [
        {
          id: "a",
          status: "watch",
        },
      ],
    });
  });

  it("validates gate-criteria input", () => {
    const rule: RuleDocument = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Approved",
          fact: "approved",
          operator: "equals",
          expected: true,
        },
      ],
    };

    expect(
      parseRuleInput(rule, {
        facts: {
          approved: true,
        },
      }),
    ).toEqual({
      facts: {
        approved: true,
      },
    });
  });

  it("rejects input for the wrong rule type", () => {
    const rule: RuleDocument = {
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
      parseRuleInput(rule, {
        children: [],
      }),
    ).toThrow();
  });

  it("rejects unknown input properties", () => {
    const rule: RuleDocument = {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "either",
    };

    expect(() =>
      parseRuleInput(rule, {
        actual: 120,
        baseline: 100,
        expression: "process.exit()",
      }),
    ).toThrow();
  });
});
