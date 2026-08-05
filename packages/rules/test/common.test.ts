import { describe, expect, it } from "vitest";

import {
  compareNumbers,
  comparisonOperatorSchema,
  directionSchema,
} from "../src";

describe("common rule schemas", () => {
  it("accepts supported comparison operators", () => {
    expect(comparisonOperatorSchema.parse("gte")).toBe("gte");
    expect(comparisonOperatorSchema.parse("lte")).toBe("lte");
  });

  it("rejects unsupported comparison operators", () => {
    expect(() => comparisonOperatorSchema.parse("execute")).toThrow();
  });

  it("accepts both performance directions", () => {
    expect(directionSchema.parse("higher_is_better")).toBe(
      "higher_is_better",
    );

    expect(directionSchema.parse("lower_is_better")).toBe(
      "lower_is_better",
    );
  });
});

describe("compareNumbers", () => {
  it("evaluates every supported operator", () => {
    expect(compareNumbers(10, "gt", 5)).toBe(true);
    expect(compareNumbers(10, "gte", 10)).toBe(true);
    expect(compareNumbers(5, "lt", 10)).toBe(true);
    expect(compareNumbers(10, "lte", 10)).toBe(true);
    expect(compareNumbers(10, "eq", 10)).toBe(true);
    expect(compareNumbers(10, "neq", 5)).toBe(true);
  });
});
