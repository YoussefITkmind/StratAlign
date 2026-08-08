import { describe, expect, it } from "vitest";

import {
  evaluateRule,
  ruleDocumentSchema,
  type RuleDocument,
} from "../src";

describe("ruleDocumentSchema", () => {
  it.each([
    {
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
    },
    {
      ruleType: "rollup",
      method: "sum",
    },
    {
      ruleType: "variance_alert",
      comparator: "gte",
      deltaType: "absolute",
      threshold: 10,
      direction: "either",
    },
    {
      ruleType: "rag_aggregation",
      method: "worst_child_wins",
    },
    {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Approved",
          fact: "approved",
          operator: "equals",
          expected: true,
        },
      ],
    },
  ] as const)("accepts $ruleType", (document) => {
    expect(ruleDocumentSchema.parse(document)).toEqual(document);
  });

  it("rejects an unsupported rule type", () => {
    expect(() =>
      ruleDocumentSchema.parse({
        ruleType: "javascript",
        expression: "process.exit()",
      }),
    ).toThrow();
  });
});

describe("evaluateRule", () => {
  it("dispatches threshold-status rules", () => {
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
        {
          label: "off_track",
          color: "red",
          comparator: "lt",
          value: 80,
        },
      ],
    };

    expect(evaluateRule(rule, { value: 90 })).toEqual({
      label: "on_track",
      color: "green",
      matchedBandIndex: 0,
    });
  });

  it("dispatches rollup rules", () => {
    expect(
      evaluateRule(
        {
          ruleType: "rollup",
          method: "sum",
        },
        {
          children: [
            { id: "a", value: 10 },
            { id: "b", value: 20 },
          ],
        },
      ),
    ).toEqual({
      value: 30,
      includedChildIds: ["a", "b"],
      excludedChildIds: [],
    });
  });

  it("dispatches variance-alert rules", () => {
    expect(
      evaluateRule(
        {
          ruleType: "variance_alert",
          comparator: "gte",
          deltaType: "absolute",
          threshold: 10,
          direction: "either",
        },
        {
          actual: 120,
          baseline: 100,
        },
      ).alert,
    ).toBe(true);
  });

  it("dispatches RAG aggregation rules", () => {
    expect(
      evaluateRule(
        {
          ruleType: "rag_aggregation",
          method: "worst_child_wins",
        },
        {
          children: [
            { id: "a", status: "on_track" },
            { id: "b", status: "watch" },
          ],
        },
      ),
    ).toEqual({
      status: "watch",
      score: 0.5,
    });
  });

  it("dispatches gate-criteria rules", () => {
    expect(
      evaluateRule(
        {
          ruleType: "gate_criteria",
          criteria: [
            {
              name: "Approved",
              fact: "approved",
              operator: "equals",
              expected: true,
            },
          ],
        },
        {
          facts: {
            approved: true,
          },
        },
      ).passed,
    ).toBe(true);
  });
});
