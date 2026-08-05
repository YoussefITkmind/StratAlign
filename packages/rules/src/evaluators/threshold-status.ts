import { compareNumbers } from "../schemas/common";
import type {
  ThresholdStatusInput,
  ThresholdStatusResult,
  ThresholdStatusRule,
} from "../schemas/threshold-status";

export function evaluateThresholdStatus(
  rule: ThresholdStatusRule,
  input: ThresholdStatusInput,
): ThresholdStatusResult {
  for (const [index, band] of rule.bands.entries()) {
    if (compareNumbers(input.value, band.comparator, band.value)) {
      return {
        label: band.label,
        color: band.color,
        matchedBandIndex: index,
      };
    }
  }

  throw new Error(
    `No threshold band matched the supplied value: ${input.value}`,
  );
}
