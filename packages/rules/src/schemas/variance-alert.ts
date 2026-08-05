import { z } from "zod";

import { comparisonOperatorSchema } from "./common";

export const varianceDeltaTypeSchema = z.enum([
  "absolute",
  "percentage",
]);

export const varianceDirectionSchema = z.enum([
  "positive",
  "negative",
  "either",
]);

export const varianceAlertRuleSchema = z.object({
  ruleType: z.literal("variance_alert"),
  comparator: comparisonOperatorSchema,
  deltaType: varianceDeltaTypeSchema,
  threshold: z.number().finite().nonnegative(),
  direction: varianceDirectionSchema,
}).strict();

export const varianceAlertInputSchema = z.object({
  actual: z.number().finite(),
  baseline: z.number().finite(),
}).strict();

export const varianceAlertResultSchema = z.object({
  alert: z.boolean(),
  delta: z.number().finite(),
  percentageDelta: z.number().finite().nullable(),
  comparedValue: z.number().finite(),
}).strict();

export type VarianceDeltaType = z.infer<
  typeof varianceDeltaTypeSchema
>;

export type VarianceDirection = z.infer<
  typeof varianceDirectionSchema
>;

export type VarianceAlertRule = z.infer<
  typeof varianceAlertRuleSchema
>;

export type VarianceAlertInput = z.infer<
  typeof varianceAlertInputSchema
>;

export type VarianceAlertResult = z.infer<
  typeof varianceAlertResultSchema
>;
