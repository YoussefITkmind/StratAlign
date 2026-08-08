/**
 * Failure taxonomy shared by every queue-backed service.
 *
 * Workers do not guess: a service tells them whether a failure is worth
 * retrying. `TransientError` is rethrown so BullMQ retries with backoff;
 * `PermanentError` marks the record failed and completes the job, because
 * retrying a malformed payload or an unknown template only burns attempts.
 */

export abstract class AppError extends Error {
  protected constructor(
    message: string,
    readonly context: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Worth retrying: connection resets, provider 5xx, rate limits, deadlocks. */
export class TransientError extends AppError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(message, context, options);
  }
}

/** Not worth retrying: bad configuration, invalid input, unknown template. */
export class PermanentError extends AppError {
  constructor(
    message: string,
    context: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(message, context, options);
  }
}

export function isTransientError(error: unknown): error is TransientError {
  return error instanceof TransientError;
}

export function isPermanentError(error: unknown): error is PermanentError {
  return error instanceof PermanentError;
}

/**
 * Prisma raises P2002 when a unique constraint rejects an insert. Across this
 * codebase that is the *expected* outcome of concurrent or replayed work
 * rather than a fault, so callers treat it as "already done".
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
