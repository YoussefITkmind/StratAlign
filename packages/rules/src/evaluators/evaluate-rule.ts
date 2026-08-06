import { evaluateGateCriteria } from "./gate-criteria";
import { evaluateRagAggregation } from "./rag-aggregation";
import { evaluateRollup } from "./rollup";
import { evaluateThresholdStatus } from "./threshold-status";
import { evaluateVarianceAlert } from "./variance-alert";

import type {
  GateCriteriaInput,
  GateCriteriaResult,
  GateCriteriaRule,
} from "../schemas/gate-criteria";
import type {
  RagAggregationInput,
  RagAggregationResult,
  RagAggregationRule,
} from "../schemas/rag-aggregation";
import type {
  RollupInput,
  RollupResult,
  RollupRule,
} from "../schemas/rollup";
import type { RuleDocument } from "../schemas/rule-document";
import type {
  ThresholdStatusInput,
  ThresholdStatusResult,
  ThresholdStatusRule,
} from "../schemas/threshold-status";
import type {
  VarianceAlertInput,
  VarianceAlertResult,
  VarianceAlertRule,
} from "../schemas/variance-alert";

export type RuleInput =
  | ThresholdStatusInput
  | RollupInput
  | VarianceAlertInput
  | RagAggregationInput
  | GateCriteriaInput;

export type RuleResult =
  | ThresholdStatusResult
  | RollupResult
  | VarianceAlertResult
  | RagAggregationResult
  | GateCriteriaResult;

export function evaluateRule(
  rule: ThresholdStatusRule,
  input: ThresholdStatusInput,
): ThresholdStatusResult;

export function evaluateRule(
  rule: RollupRule,
  input: RollupInput,
): RollupResult;

export function evaluateRule(
  rule: VarianceAlertRule,
  input: VarianceAlertInput,
): VarianceAlertResult;

export function evaluateRule(
  rule: RagAggregationRule,
  input: RagAggregationInput,
): RagAggregationResult;

export function evaluateRule(
  rule: GateCriteriaRule,
  input: GateCriteriaInput,
): GateCriteriaResult;

export function evaluateRule(
  rule: RuleDocument,
  input: RuleInput,
): RuleResult;

export function evaluateRule(
  rule: RuleDocument,
  input: RuleInput,
): RuleResult {
  switch (rule.ruleType) {
    case "threshold_status":
      return evaluateThresholdStatus(
        rule,
        input as ThresholdStatusInput,
      );

    case "rollup":
      return evaluateRollup(
        rule,
        input as RollupInput,
      );

    case "variance_alert":
      return evaluateVarianceAlert(
        rule,
        input as VarianceAlertInput,
      );

    case "rag_aggregation":
      return evaluateRagAggregation(
        rule,
        input as RagAggregationInput,
      );

    case "gate_criteria":
      return evaluateGateCriteria(
        rule,
        input as GateCriteriaInput,
      );
  }
}
