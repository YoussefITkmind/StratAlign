import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  evaluateRollup,
  type RollupRule,
} from "../src";

describe("weighted average properties", () => {
  it("always stays between the minimum and maximum child values", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.double({
            min: -1_000_000,
            max: 1_000_000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        fc.array(
          fc.double({
            min: 0.000001,
            max: 1_000_000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          {
            minLength: 1,
            maxLength: 20,
          },
        ),
        (values, generatedWeights) => {
          fc.pre(values.length === generatedWeights.length);

          const totalWeight = generatedWeights.reduce(
            (total, weight) => total + weight,
            0,
          );

          const normalizedWeights = generatedWeights.map(
            (weight) => weight / totalWeight,
          );

          const children = values.map((value, index) => ({
            id: `child-${index}`,
            value,
          }));

          const weights = Object.fromEntries(
            normalizedWeights.map((weight, index) => [
              `child-${index}`,
              weight,
            ]),
          );

          const rule: RollupRule = {
            ruleType: "rollup",
            method: "weighted_average",
            weights,
          };

          const result = evaluateRollup(rule, { children });

          expect(result.value).not.toBeNull();

          const value = result.value as number;
          const minimum = Math.min(...values);
          const maximum = Math.max(...values);

          expect(value).toBeGreaterThanOrEqual(
            minimum - Number.EPSILON * 100,
          );

          expect(value).toBeLessThanOrEqual(
            maximum + Number.EPSILON * 100,
          );

          expect(
            normalizedWeights.reduce(
              (total, weight) => total + weight,
              0,
            ),
          ).toBeCloseTo(1, 10);
        },
      ),
      {
        numRuns: 500,
      },
    );
  });
});
