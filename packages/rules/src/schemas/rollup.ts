import { z } from "zod";

import { directionSchema } from "./common";

export const rollupMethodSchema = z.enum([
  "sum",
  "average",
  "weighted_average",
  "worst_of",
]);

const baseRollupRuleSchema = z.object({
  ruleType: z.literal("rollup"),
}).strict();

const sumOrAverageRuleSchema = baseRollupRuleSchema.extend({
  method: z.enum(["sum", "average"]),
});

const weightedAverageRuleSchema = baseRollupRuleSchema.extend({
  method: z.literal("weighted_average"),
  weights: z.record(z.string().trim().min(1), z.number().finite().nonnegative()),
});

const worstOfRuleSchema = baseRollupRuleSchema.extend({
  method: z.literal("worst_of"),
  direction: directionSchema,
});

export const rollupRuleSchema = z.discriminatedUnion("method", [
  sumOrAverageRuleSchema,
  weightedAverageRuleSchema,
  worstOfRuleSchema,
]);

export const rollupInputSchema = z.object({
  children: z.array(
    z.object({
      id: z.string().trim().min(1),
      value: z.number().finite().nullable(),
    }).strict(),
  ),
}).strict();

export const rollupResultSchema = z.object({
  value: z.number().finite().nullable(),
  includedChildIds: z.array(z.string()),
  excludedChildIds: z.array(z.string()),
}).strict();

export type RollupMethod = z.infer<typeof rollupMethodSchema>;
export type RollupRule = z.infer<typeof rollupRuleSchema>;
export type RollupInput = z.infer<typeof rollupInputSchema>;
export type RollupResult = z.infer<typeof rollupResultSchema>;
