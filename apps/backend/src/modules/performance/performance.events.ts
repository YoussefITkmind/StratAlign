/**
 * The performance module's event contract.
 *
 * Inbound events are consumed by the recompute subscriber; outbound events are
 * written to the transactional outbox in the same transaction as the state they
 * announce, following the pattern established by the scheduler.
 */

export const PERFORMANCE_EVENT_TYPES = {
  /** Emitted by the measurement service whenever a measurement row is inserted. */
  measurementRecorded: "performance.measurement.recorded",
  /** Emitted for every completed rule evaluation. */
  statusComputed: "performance.status.computed",
  /** Emitted only on a transition *into* the off-track status. */
  thresholdBreached: "performance.threshold.breached",
} as const;

export type PerformanceEventType =
  (typeof PERFORMANCE_EVENT_TYPES)[keyof typeof PERFORMANCE_EVENT_TYPES];

export const PERFORMANCE_EVENT_VERSION = 1;

export const MEASUREMENT_AGGREGATE_TYPE = "performance_measurement";
export const KPI_PERFORMANCE_AGGREGATE_TYPE = "performance_kpi";

/**
 * The `subjectType` a cadence definition must carry for `schedule.window.closed`
 * to be interpreted as a performance capture window. The scheduler stays
 * generic: it never learns what this string means.
 */
export const PERFORMANCE_SCHEDULE_SUBJECT_TYPE = "performance_kpi";

/**
 * The status label that counts as off-track.
 *
 * This is not a threshold rule of its own — the value is produced by the Rule
 * Engine, and this constant only names which of its labels the breach event
 * watches for. It matches the label used by the repository's golden threshold
 * fixtures.
 */
export const OFF_TRACK_STATUS = "off_track";

export interface MeasurementRecordedPayload extends Record<string, unknown> {
  measurementId: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  source: string;
  locked: boolean;
  supersedesId: string | null;
  recordedAt: string;
}

export interface StatusComputedPayload extends Record<string, unknown> {
  statusResultId: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  status: string;
  previousStatus: string | null;
  ruleVersionUsed: string;
  computedAt: string;
}

export interface ThresholdBreachedPayload extends Record<string, unknown> {
  statusResultId: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  status: string;
  previousStatus: string | null;
  ruleVersionUsed: string;
  breachedAt: string;
}

/**
 * Stable idempotency key. It is derived from the logical identity of the result
 * and the event that triggered the computation, so a retried worker produces
 * the same key and the outbox's unique index absorbs the duplicate.
 */
export function performanceDedupeKey(
  eventType: PerformanceEventType,
  ...parts: readonly string[]
): string {
  return [eventType, ...parts].join("|");
}
