import { z } from "zod";

export const comparisonOperatorSchema = z.enum([
  "gt",
  "gte",
  "lt",
  "lte",
  "eq",
  "neq",
]);

export type ComparisonOperator = z.infer<typeof comparisonOperatorSchema>;

export const directionSchema = z.enum([
  "higher_is_better",
  "lower_is_better",
]);

export type Direction = z.infer<typeof directionSchema>;

export function compareNumbers(
  actual: number,
  operator: ComparisonOperator,
  expected: number,
): boolean {
  switch (operator) {
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
  }
}
