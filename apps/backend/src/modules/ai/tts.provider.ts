/**
 * Provider-agnostic contract for text-to-speech, mirroring `LlmProvider`'s
 * shape (`llm.provider.ts`). The rest of the platform depends on this
 * interface, never on a vendor SDK — a second TTS vendor would be a new
 * class implementing this interface, not a new call site.
 */

export interface TtsRequest {
  /** English-only text, already validated by the caller. */
  readonly text: string;
  readonly voice: string;
  readonly model: string;
  /** Traced through to the log record, never sent upstream. */
  readonly feature: string;
}

export interface TtsResult {
  readonly audio: Buffer;
  readonly mimeType: string;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
}

export interface TtsProvider {
  /** Stable provider identity, safe to record in provenance and logs. */
  readonly name: string;
  readonly isConfigured: boolean;

  synthesize(request: TtsRequest): Promise<TtsResult>;
}
