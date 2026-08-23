/**
 * Provider-agnostic contract for a single structured completion.
 *
 * The rest of the platform depends on this interface, never on a vendor SDK.
 * That keeps credentials, wire formats, and retry policy inside this module,
 * and means a second provider is a new class rather than a new call site.
 */

export interface LlmCompletionRequest {
  /** System-level instructions. Never contains user-authored free text. */
  readonly system: string;
  /** The task payload. May embed sanitised domain context. */
  readonly prompt: string;
  readonly maxOutputTokens: number;
  /** 0 is deterministic; suggestion generation wants a little spread. */
  readonly temperature: number;
  /** Traced through to the log record, never sent upstream. */
  readonly feature: string;
  /**
   * "json" forces a structured JSON object back (the default — preserves
   * every existing caller's behaviour). "text" asks for plain prose instead;
   * a provider that only supports strict JSON mode must not silently coerce
   * a "text" request into JSON mode, since some providers (OpenAI) reject a
   * JSON-mode request outright unless the prompt itself mentions "json".
   */
  readonly responseFormat?: "json" | "text";
}

export interface LlmCompletionResult {
  /** Raw model text. Callers must validate before trusting it. */
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
}

export interface LlmProvider {
  /** Stable provider identity, safe to record in provenance and logs. */
  readonly name: string;
  /** Model identifier, safe to record in provenance and logs. */
  readonly model: string;
  /** False when the provider is a placeholder and will always refuse. */
  readonly isConfigured: boolean;

  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
