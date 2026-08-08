import { compareNumbers } from "../schemas/common";
import type {
  VarianceAlertInput,
  VarianceAlertResult,
  VarianceAlertRule,
} from "../schemas/variance-alert";

function applyDirection(
  delta: number,
  direction: VarianceAlertRule["direction"],
): number {
  switch (direction) {
    case "positive":
      return delta;
    case "negative":
      return -delta;
    case "either":
      return Math.abs(delta);
  }
}

export function evaluateVarianceAlert(
  rule: VarianceAlertRule,
  input: VarianceAlertInput,
): VarianceAlertResult {
  const delta = input.actual - input.baseline;

  const percentageDelta =
    input.baseline === 0
      ? null
      : (delta / Math.abs(input.baseline)) * 100;

  if (
    rule.deltaType === "percentage" &&
    percentageDelta === null
  ) {
    throw new Error(
      "Percentage variance cannot be evaluated when baseline is zero",
    );
  }

  const rawComparedValue =
    rule.deltaType === "absolute"
      ? delta
      : percentageDelta;

  const comparedValue = applyDirection(
    rawComparedValue as number,
    rule.direction,
  );

  return {
    alert: compareNumbers(
      comparedValue,
      rule.comparator,
      rule.threshold,
    ),
    delta,
    percentageDelta,
    comparedValue,
  };
}
