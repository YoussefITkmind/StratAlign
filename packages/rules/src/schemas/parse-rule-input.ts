import { gateCriteriaInputSchema } from "./gate-criteria";
import { ragAggregationInputSchema } from "./rag-aggregation";
import { rollupInputSchema } from "./rollup";
import type { RuleDocument } from "./rule-document";
import { thresholdStatusInputSchema } from "./threshold-status";
import { varianceAlertInputSchema } from "./variance-alert";

import type { RuleInput } from "../evaluators/evaluate-rule";

export function parseRuleInput(
  rule: RuleDocument,
  input: unknown,
): RuleInput {
  switch (rule.ruleType) {
    case "threshold_status":
      return thresholdStatusInputSchema.parse(input);

    case "rollup":
      return rollupInputSchema.parse(input);

    case "variance_alert":
      return varianceAlertInputSchema.parse(input);

    case "rag_aggregation":
      return ragAggregationInputSchema.parse(input);

    case "gate_criteria":
      return gateCriteriaInputSchema.parse(input);
  }
}
