import { z } from "zod";

export const ragStatusSchema = z.enum([
  "on_track",
  "watch",
  "off_track",
]);

const worstChildWinsRuleSchema = z.object({
  ruleType: z.literal("rag_aggregation"),
  method: z.literal("worst_child_wins"),
}).strict();

const weightedCountRuleSchema = z.object({
  ruleType: z.literal("rag_aggregation"),
  method: z.literal("weighted_count"),
  watchThreshold: z.number().finite().min(0).max(1),
  offTrackThreshold: z.number().finite().min(0).max(1),
}).strict().refine(
  (rule) => rule.watchThreshold <= rule.offTrackThreshold,
  {
    message: "watchThreshold must be less than or equal to offTrackThreshold",
    path: ["watchThreshold"],
  },
);

export const ragAggregationRuleSchema = z.discriminatedUnion("method", [
  worstChildWinsRuleSchema,
  weightedCountRuleSchema,
]);

export const ragAggregationInputSchema = z.object({
  children: z.array(
    z.object({
      id: z.string().trim().min(1),
      status: ragStatusSchema,
      weight: z.number().finite().positive().optional(),
    }).strict(),
  ).min(1),
}).strict();

export const ragAggregationResultSchema = z.object({
  status: ragStatusSchema,
  score: z.number().finite().min(0).max(1),
}).strict();

export type RagStatus = z.infer<typeof ragStatusSchema>;
export type RagAggregationRule = z.infer<
  typeof ragAggregationRuleSchema
>;
export type RagAggregationInput = z.infer<
  typeof ragAggregationInputSchema
>;
export type RagAggregationResult = z.infer<
  typeof ragAggregationResultSchema
>;
