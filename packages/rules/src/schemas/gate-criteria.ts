import { z } from "zod";

export const gateFactValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const gateOperatorSchema = z.enum([
  "equals",
  "not_equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "exists",
]);

const baseCriterionSchema = z.object({
  name: z.string().trim().min(1).max(150),
  fact: z.string().trim().min(1).max(150),
}).strict();

const equalityCriterionSchema = baseCriterionSchema.extend({
  operator: z.enum(["equals", "not_equals"]),
  expected: gateFactValueSchema,
});

const numericCriterionSchema = baseCriterionSchema.extend({
  operator: z.enum(["gt", "gte", "lt", "lte"]),
  expected: z.number().finite(),
});

const inCriterionSchema = baseCriterionSchema.extend({
  operator: z.literal("in"),
  expected: z.array(gateFactValueSchema).min(1),
});

const existsCriterionSchema = baseCriterionSchema.extend({
  operator: z.literal("exists"),
  expected: z.boolean(),
});

export const gateCriterionSchema = z.discriminatedUnion("operator", [
  equalityCriterionSchema,
  numericCriterionSchema,
  inCriterionSchema,
  existsCriterionSchema,
]);

export const gateCriteriaRuleSchema = z.object({
  ruleType: z.literal("gate_criteria"),
  criteria: z.array(gateCriterionSchema).min(1),
}).strict();

export const gateCriteriaInputSchema = z.object({
  facts: z.record(z.string(), gateFactValueSchema),
}).strict();

export const gateCriterionResultSchema = z.object({
  name: z.string(),
  fact: z.string(),
  passed: z.boolean(),
  actual: gateFactValueSchema.optional(),
  expected: z.union([
    gateFactValueSchema,
    z.array(gateFactValueSchema),
  ]),
}).strict();

export const gateCriteriaResultSchema = z.object({
  passed: z.boolean(),
  criteria: z.array(gateCriterionResultSchema),
}).strict();

export type GateFactValue = z.infer<typeof gateFactValueSchema>;
export type GateOperator = z.infer<typeof gateOperatorSchema>;
export type GateCriterion = z.infer<typeof gateCriterionSchema>;
export type GateCriteriaRule = z.infer<typeof gateCriteriaRuleSchema>;
export type GateCriteriaInput = z.infer<typeof gateCriteriaInputSchema>;
export type GateCriterionResult = z.infer<
  typeof gateCriterionResultSchema
>;
export type GateCriteriaResult = z.infer<
  typeof gateCriteriaResultSchema
>;
