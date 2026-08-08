import { z } from "zod";

import {
  comparisonOperatorSchema,
  directionSchema,
} from "./common";

export const thresholdBandSchema = z.object({
  label: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50),
  comparator: comparisonOperatorSchema,
  value: z.number().finite(),
}).strict();

export const thresholdStatusRuleSchema = z.object({
  ruleType: z.literal("threshold_status"),
  direction: directionSchema,
  bands: z.array(thresholdBandSchema).min(1),
}).strict();

export const thresholdStatusInputSchema = z.object({
  value: z.number().finite(),
}).strict();

export const thresholdStatusResultSchema = z.object({
  label: z.string(),
  color: z.string(),
  matchedBandIndex: z.number().int().nonnegative(),
}).strict();

export type ThresholdBand = z.infer<typeof thresholdBandSchema>;
export type ThresholdStatusRule = z.infer<typeof thresholdStatusRuleSchema>;
export type ThresholdStatusInput = z.infer<typeof thresholdStatusInputSchema>;
export type ThresholdStatusResult = z.infer<typeof thresholdStatusResultSchema>;
