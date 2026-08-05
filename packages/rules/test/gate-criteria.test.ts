import { describe, expect, it } from "vitest";

import {
  evaluateGateCriteria,
  gateCriteriaRuleSchema,
  type GateCriteriaRule,
} from "../src";

const rule: GateCriteriaRule = {
  ruleType: "gate_criteria",
  criteria: [
    {
      name: "Budget approved",
      fact: "budgetApproved",
      operator: "equals",
      expected: true,
    },
    {
      name: "Risk score acceptable",
      fact: "riskScore",
      operator: "lte",
      expected: 30,
    },
    {
      name: "Region allowed",
      fact: "region",
      operator: "in",
      expected: ["uk", "eu"],
    },
    {
      name: "Sponsor supplied",
      fact: "sponsor",
      operator: "exists",
      expected: true,
    },
  ],
};

describe("gateCriteriaRuleSchema", () => {
  it("accepts structured criteria", () => {
    expect(gateCriteriaRuleSchema.parse(rule)).toEqual(rule);
  });

  it("rejects unsupported operators", () => {
    expect(() =>
      gateCriteriaRuleSchema.parse({
        ruleType: "gate_criteria",
        criteria: [
          {
            name: "Unsafe criterion",
            fact: "value",
            operator: "execute",
            expected: true,
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects arbitrary expression fields", () => {
    expect(() =>
      gateCriteriaRuleSchema.parse({
        ruleType: "gate_criteria",
        criteria: [
          {
            name: "Unsafe expression",
            fact: "value",
            operator: "equals",
            expected: true,
            expression: "process.exit()",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects a top-level executable expression", () => {
    expect(() =>
      gateCriteriaRuleSchema.parse({
        ruleType: "gate_criteria",
        criteria: [
          {
            name: "Valid criterion",
            fact: "approved",
            operator: "equals",
            expected: true,
          },
        ],
        expression:
          "globalThis.constructor.constructor('return process')()",
      }),
    ).toThrow();
  });

  it("rejects JavaScript-like criteria instead of executing them", () => {
    expect(() =>
      gateCriteriaRuleSchema.parse({
        ruleType: "gate_criteria",
        criteria: [
          {
            name: "Arbitrary code",
            expression: "facts.score > 10",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("evaluateGateCriteria", () => {
  it("passes when every criterion passes", () => {
    const result = evaluateGateCriteria(rule, {
      facts: {
        budgetApproved: true,
        riskScore: 20,
        region: "uk",
        sponsor: "Finance Director",
      },
    });

    expect(result.passed).toBe(true);
    expect(
      result.criteria.every((criterion) => criterion.passed),
    ).toBe(true);
  });

  it("fails when one criterion fails", () => {
    const result = evaluateGateCriteria(rule, {
      facts: {
        budgetApproved: true,
        riskScore: 50,
        region: "uk",
        sponsor: "Finance Director",
      },
    });

    expect(result.passed).toBe(false);

    expect(
      result.criteria.find(
        (criterion) =>
          criterion.name === "Risk score acceptable",
      )?.passed,
    ).toBe(false);
  });

  it("supports boolean equality", () => {
    const booleanRule: GateCriteriaRule = {
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
      evaluateGateCriteria(booleanRule, {
        facts: { approved: true },
      }).passed,
    ).toBe(true);
  });

  it("supports string equality", () => {
    const stringRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Correct status",
          fact: "status",
          operator: "equals",
          expected: "ready",
        },
      ],
    };

    expect(
      evaluateGateCriteria(stringRule, {
        facts: { status: "ready" },
      }).passed,
    ).toBe(true);
  });

  it("supports numeric comparisons", () => {
    const numericRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Minimum score",
          fact: "score",
          operator: "gte",
          expected: 80,
        },
      ],
    };

    expect(
      evaluateGateCriteria(numericRule, {
        facts: { score: 80 },
      }).passed,
    ).toBe(true);
  });

  it("fails numeric comparisons for non-numeric facts", () => {
    const numericRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Minimum score",
          fact: "score",
          operator: "gte",
          expected: 80,
        },
      ],
    };

    expect(
      evaluateGateCriteria(numericRule, {
        facts: { score: "80" },
      }).passed,
    ).toBe(false);
  });

  it("supports the in operator", () => {
    const inRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Allowed type",
          fact: "type",
          operator: "in",
          expected: ["programme", "project"],
        },
      ],
    };

    expect(
      evaluateGateCriteria(inRule, {
        facts: { type: "project" },
      }).passed,
    ).toBe(true);
  });

  it("supports exists true", () => {
    const existsRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Owner supplied",
          fact: "owner",
          operator: "exists",
          expected: true,
        },
      ],
    };

    expect(
      evaluateGateCriteria(existsRule, {
        facts: { owner: null },
      }).passed,
    ).toBe(true);
  });

  it("supports exists false", () => {
    const existsRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Exception absent",
          fact: "exception",
          operator: "exists",
          expected: false,
        },
      ],
    };

    expect(
      evaluateGateCriteria(existsRule, {
        facts: {},
      }).passed,
    ).toBe(true);
  });

  it("reports a missing fact without inventing a value", () => {
    const equalityRule: GateCriteriaRule = {
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

    const result = evaluateGateCriteria(equalityRule, {
      facts: {},
    });

    expect(result.passed).toBe(false);
    expect(result.criteria[0]).not.toHaveProperty("actual");
  });

  it("supports not-equals", () => {
    const notEqualsRule: GateCriteriaRule = {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Not blocked",
          fact: "status",
          operator: "not_equals",
          expected: "blocked",
        },
      ],
    };

    expect(
      evaluateGateCriteria(notEqualsRule, {
        facts: { status: "ready" },
      }).passed,
    ).toBe(true);
  });
});
