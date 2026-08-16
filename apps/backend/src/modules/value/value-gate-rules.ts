import type { RuleDocument } from "@spm/rules";

export const VALUE_GATE_RULE_LIBRARY: ReadonlyArray<{
  key: string;
  name: string;
  document: RuleDocument;
}> = [
  {
    key: "value_gate_benefit_baseline",
    name: "Value Gate — benefit baseline exists",
    document: {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Every registered benefit has an approved baseline",
          fact: "benefitBaselineExists",
          operator: "equals",
          expected: true,
        },
      ],
    },
  },
  {
    key: "value_gate_critical_risk",
    name: "Value Gate — no open critical risk",
    document: {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "No open critical risk indicator",
          fact: "openCriticalRisk",
          operator: "equals",
          expected: false,
        },
      ],
    },
  },
  {
    key: "value_gate_variance_tolerance",
    name: "Value Gate — value variance within tolerance",
    document: {
      ruleType: "gate_criteria",
      criteria: [
        {
          name: "Realized value variance is within ten percent",
          fact: "valueVariancePct",
          operator: "lte",
          expected: 10,
        },
      ],
    },
  },
] as const;
