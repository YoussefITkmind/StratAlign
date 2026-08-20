/**
 * Failure taxonomy for AI-assisted suggestion generation.
 *
 * Mirrors `RegistryOperationError`: services throw a typed domain error with a
 * stable `code`, and the tRPC layer duck-types that code to pick an HTTP-ish
 * status. No provider detail, prompt text, credential, or upstream body is ever
 * carried in these messages — they are written to be shown to an end user.
 */

/** The configured provider is absent, disabled, or refused to answer at all. */
export class AiUnavailableError extends Error {
  readonly code = "AI_UNAVAILABLE";

  constructor(message = "AI suggestions are unavailable right now") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** The provider did not answer inside the configured budget. */
export class AiTimeoutError extends Error {
  readonly code = "AI_TIMEOUT";

  constructor(message = "The AI service took too long to respond") {
    super(message);
    this.name = "AiTimeoutError";
  }
}

/** The provider answered, but not with the structure the schema requires. */
export class AiMalformedOutputError extends Error {
  readonly code = "AI_MALFORMED_OUTPUT";

  constructor(message = "The AI response could not be understood") {
    super(message);
    this.name = "AiMalformedOutputError";
  }
}

/** Anything the caller asked for that this module refuses on its own terms. */
export class AiSuggestionError extends Error {
  readonly code = "AI_SUGGESTION_FAILED";

  constructor(message = "Unable to complete the AI suggestion operation") {
    super(message);
    this.name = "AiSuggestionError";
  }
}

/**
 * The candidate collides with something the registry already holds.
 *
 * A distinct class rather than a message convention: the reviewer can override
 * this one by acknowledging the collision, and no other refusal is overridable,
 * so callers need to tell them apart without reading prose.
 */
export class AiDuplicateSuggestionError extends AiSuggestionError {
  constructor(readonly existingName: string) {
    super(`This looks like an existing item: "${existingName}"`);
    this.name = "AiDuplicateSuggestionError";
  }
}

/**
 * Another accept of this same proposal is already in flight and has not
 * finished yet.
 *
 * Distinct from a plain failure: nothing is wrong, the caller simply lost the
 * race and the winner did not settle inside the wait budget. Retrying later
 * resolves to whatever the winner created, and never to a second record.
 */
export class AiAcceptInProgressError extends AiSuggestionError {
  constructor(
    message = "This suggestion is already being accepted. Try again in a moment.",
  ) {
    super(message);
    this.name = "AiAcceptInProgressError";
  }
}

/** The theme id does not resolve to a live theme node. */
export class AiThemeNotFoundError extends AiSuggestionError {
  constructor(message = "Theme was not found") {
    super(message);
    this.name = "AiThemeNotFoundError";
  }
}

const AI_ERROR_CODES = new Set([
  "AI_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_MALFORMED_OUTPUT",
  "AI_SUGGESTION_FAILED",
]);

export function isAiError(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    AI_ERROR_CODES.has((error as { code: string }).code)
  );
}
