import { z } from "zod";

import { gateCriteriaRuleSchema } from "./gate-criteria";
import { ragAggregationRuleSchema } from "./rag-aggregation";
import { rollupRuleSchema } from "./rollup";
import { thresholdStatusRuleSchema } from "./threshold-status";
import { varianceAlertRuleSchema } from "./variance-alert";

export const ruleDocumentSchema = z.discriminatedUnion("ruleType", [
  thresholdStatusRuleSchema,
  rollupRuleSchema,
  varianceAlertRuleSchema,
  ragAggregationRuleSchema,
  gateCriteriaRuleSchema,
]);

export type RuleDocument = z.infer<typeof ruleDocumentSchema>;
export type RuleType = RuleDocument["ruleType"];
