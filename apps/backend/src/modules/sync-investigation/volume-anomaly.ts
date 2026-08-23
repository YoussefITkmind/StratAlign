/**
 * Deterministic historical-volume comparison.
 *
 * Task 5 explicitly calls out volume drops, and arithmetic the application can
 * do reliably must not be delegated to the model — this is that arithmetic.
 * The AI investigation service hands the result to the prompt as pre-computed
 * evidence; the model explains it, it never recomputes it.
 */

/** A drop at or beyond this percentage, against the recent successful
 * average, is called out to the model as significant. */
export const SIGNIFICANT_DROP_THRESHOLD_PERCENT = 30;

export interface VolumeAnomalyEvidence {
  /** False when there is no successful run history for this source at all. */
  hasHistoricalData: boolean;
  /** Most recent successful volumes first, oldest last. */
  previousSuccessfulVolumes: number[];
  previousSuccessfulAverage: number | null;
  mostRecentSuccessfulVolume: number | null;
  /** Positive means a drop; negative means the current run is larger.
   * Null whenever there is nothing to compare against. */
  percentDrop: number | null;
  isSignificantDrop: boolean;
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeVolumeAnomaly(
  currentVolume: number | null,
  historicalSuccessfulVolumes: readonly number[],
): VolumeAnomalyEvidence {
  const previousSuccessfulVolumes = [...historicalSuccessfulVolumes];
  const hasHistoricalData = previousSuccessfulVolumes.length > 0;
  const previousSuccessfulAverage = hasHistoricalData
    ? average(previousSuccessfulVolumes)
    : null;
  const mostRecentSuccessfulVolume = previousSuccessfulVolumes[0] ?? null;

  if (
    currentVolume === null ||
    previousSuccessfulAverage === null ||
    previousSuccessfulAverage <= 0
  ) {
    return {
      hasHistoricalData,
      previousSuccessfulVolumes,
      previousSuccessfulAverage,
      mostRecentSuccessfulVolume,
      percentDrop: null,
      isSignificantDrop: false,
    };
  }

  const percentDrop =
    ((previousSuccessfulAverage - currentVolume) / previousSuccessfulAverage) * 100;

  return {
    hasHistoricalData,
    previousSuccessfulVolumes,
    previousSuccessfulAverage,
    mostRecentSuccessfulVolume,
    percentDrop,
    isSignificantDrop: percentDrop >= SIGNIFICANT_DROP_THRESHOLD_PERCENT,
  };
}
