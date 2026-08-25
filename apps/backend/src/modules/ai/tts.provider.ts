import { AiUnavailableError } from "./ai.errors";

/**
 * Provider-agnostic contract for one text-to-speech synthesis.
 *
 * Mirrors `LlmProvider`: the service that needs speech depends on this
 * interface, never on a vendor's wire format. Credentials, retry policy, and
 * error normalisation stay inside the implementations, so adding a second TTS
 * vendor is a new class rather than a change at the call site.
 */

export interface TtsSynthesisRequest {
  /** Already validated, English-only. Providers must not re-interpret it. */
  readonly text: string;
  /** Traced through to the log record, never sent upstream. */
  readonly feature: string;
}

export interface TtsSynthesisResult {
  readonly audio: Buffer;
  readonly contentType: string;
  readonly format: "mp3";
  readonly provider: string;
  readonly model: string;
  readonly voice: string;
  readonly latencyMs: number;
}

export interface TtsProvider {
  /** Stable provider identity, safe to record in provenance and logs. */
  readonly name: string;
  readonly model: string;
  readonly voice: string;
  /** False when the provider is a placeholder and will always refuse. */
  readonly isConfigured: boolean;

  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}

/**
 * Stand-in used when no TTS credentials are configured.
 *
 * Refusing at call time rather than throwing at construction is deliberate and
 * matches `UnconfiguredLlmProvider`: the platform must boot and serve every
 * non-AI route with no AI credentials at all, which is the normal case for
 * local development and CI.
 */
export class UnconfiguredTtsProvider implements TtsProvider {
  readonly name = "unconfigured";
  readonly model = "none";
  readonly voice = "none";
  readonly isConfigured = false;

  synthesize(): Promise<TtsSynthesisResult> {
    return Promise.reject(
      new AiUnavailableError("Audio briefing is not available right now"),
    );
  }
}
