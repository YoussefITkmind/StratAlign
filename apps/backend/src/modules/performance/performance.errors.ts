/**
 * Performance domain failures.
 *
 * Each error carries a stable `code` that the tRPC layer maps to a transport
 * status. Messages here are safe to surface: they describe the domain rule that
 * was violated and never quote SQL, Prisma internals or worker state.
 */

export type PerformanceErrorCode =
  | "INVALID_CAPTURE_TRANSITION"
  | "CAPTURE_SESSION_NOT_FOUND"
  | "DUPLICATE_ACTIVE_SESSION"
  | "RECALL_CUTOFF_REACHED"
  | "RECALL_NOT_PERMITTED"
  | "MEASUREMENT_LOCKED"
  | "FEED_MEASUREMENT_LOCKED"
  | "INVALID_SUPERSESSION"
  | "MEASUREMENT_NOT_FOUND"
  | "COMMENTARY_CONTENT_REQUIRED"
  | "RULE_NOT_FOUND"
  | "RULE_EVALUATION_FAILED";

export class PerformanceError extends Error {
  constructor(
    readonly code: PerformanceErrorCode,
    message: string,
    readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PerformanceError";
  }
}

export function isPerformanceError(
  error: unknown,
): error is PerformanceError {
  return error instanceof PerformanceError;
}

export const performanceErrors = {
  invalidCaptureTransition(from: string, to: string): PerformanceError {
    return new PerformanceError(
      "INVALID_CAPTURE_TRANSITION",
      `A ${from} capture session cannot move to ${to}`,
      { from, to },
    );
  },

  captureSessionNotFound(): PerformanceError {
    return new PerformanceError(
      "CAPTURE_SESSION_NOT_FOUND",
      "Capture session was not found",
    );
  },

  duplicateActiveSession(): PerformanceError {
    return new PerformanceError(
      "DUPLICATE_ACTIVE_SESSION",
      "An active capture session already exists for this KPI, scope and period",
    );
  },

  recallCutoffReached(reason: "deadline" | "consumed"): PerformanceError {
    return new PerformanceError(
      "RECALL_CUTOFF_REACHED",
      reason === "consumed"
        ? "This submission has already been consumed downstream and can no longer be recalled"
        : "The recall window for this submission has closed",
      { reason },
    );
  },

  recallNotPermitted(): PerformanceError {
    return new PerformanceError(
      "RECALL_NOT_PERMITTED",
      "Only the session owner or a data steward may recall this submission",
    );
  },

  measurementLocked(): PerformanceError {
    return new PerformanceError(
      "MEASUREMENT_LOCKED",
      "This measurement is locked and cannot be manually corrected",
    );
  },

  feedMeasurementLocked(): PerformanceError {
    return new PerformanceError(
      "FEED_MEASUREMENT_LOCKED",
      "This measurement was supplied by a locked feed and cannot be manually overwritten",
    );
  },

  invalidSupersession(reason: string): PerformanceError {
    return new PerformanceError(
      "INVALID_SUPERSESSION",
      reason,
    );
  },

  measurementNotFound(): PerformanceError {
    return new PerformanceError(
      "MEASUREMENT_NOT_FOUND",
      "Measurement was not found",
    );
  },

  commentaryContentRequired(): PerformanceError {
    return new PerformanceError(
      "COMMENTARY_CONTENT_REQUIRED",
      "Commentary must contain English or Arabic content",
    );
  },

  ruleNotFound(ruleKey: string): PerformanceError {
    return new PerformanceError(
      "RULE_NOT_FOUND",
      "No published rule was found for this KPI",
      { ruleKey },
    );
  },

  ruleEvaluationFailed(ruleKey: string): PerformanceError {
    return new PerformanceError(
      "RULE_EVALUATION_FAILED",
      "The rule engine could not evaluate this KPI",
      { ruleKey },
    );
  },
} as const;
