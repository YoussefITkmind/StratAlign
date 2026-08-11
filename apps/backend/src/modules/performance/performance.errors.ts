export class PerformanceOperationError extends Error {
  readonly code = "PERFORMANCE_OPERATION_FAILED";

  constructor(message = "Unable to complete performance operation") {
    super(message);
    this.name = "PerformanceOperationError";
  }
}

export class MeasurementImmutabilityError extends Error {
  readonly code = "MEASUREMENT_IMMUTABLE";

  constructor(message = "Measurements are immutable and cannot be updated or deleted") {
    super(message);
    this.name = "MeasurementImmutabilityError";
  }
}

export class FeedLockError extends Error {
  readonly code = "FEED_LOCKED";

  constructor(message = "Cannot overwrite a locked feed measurement") {
    super(message);
    this.name = "FeedLockError";
  }
}

export class CaptureSessionError extends Error {
  readonly code = "CAPTURE_SESSION_ERROR";

  constructor(message = "Invalid capture session operation") {
    super(message);
    this.name = "CaptureSessionError";
  }
}
