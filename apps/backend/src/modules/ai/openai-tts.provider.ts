import type { Logger } from "../../logging/logger";

import { AiTimeoutError, AiUnavailableError } from "./ai.errors";
import type {
  TtsProvider,
  TtsSynthesisRequest,
  TtsSynthesisResult,
} from "./tts.provider";

export interface OpenAiTtsProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly voice: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Additional attempts after the first, so 2 means up to three calls. */
  readonly maxRetries: number;
}

/**
 * Ceiling on the audio we will hold in memory and hand to a client. Ninety
 * seconds of speech is far below this; anything approaching it means the
 * upstream returned something other than the brief we asked for.
 */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** Status codes where another attempt is plausibly a different outcome. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1000ms … capped. Deterministic so tests can advance timers.
  return Math.min(250 * 2 ** attempt, 4_000);
}

/**
 * OpenAI's speech endpoint over `fetch`.
 *
 * Mirrors `OpenAiLlmProvider` on purpose: dependency-free, same retry and
 * timeout policy, and every failure normalised to this module's own error
 * types so no upstream body — which can echo the submitted text — leaves this
 * class except as a status code in a debug log.
 */
export class OpenAiTtsProvider implements TtsProvider {
  readonly name = "openai";
  readonly isConfigured = true;

  constructor(
    private readonly options: OpenAiTtsProviderOptions,
    private readonly logger: Logger,
  ) {}

  get model(): string {
    return this.options.model;
  }

  get voice(): string {
    return this.options.voice;
  }

  async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const startedAt = Date.now();
    let lastFailure: Error = new AiUnavailableError();

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      try {
        return await this.attempt(request, startedAt);
      } catch (error) {
        lastFailure = this.normalise(error);

        const retryable =
          error instanceof RetryableUpstreamError ||
          lastFailure instanceof AiTimeoutError;

        if (!retryable || attempt === this.options.maxRetries) {
          break;
        }

        this.logger.warn("Retrying speech synthesis", {
          feature: request.feature,
          provider: this.name,
          attempt: attempt + 1,
        });

        await delay(backoffMs(attempt));
      }
    }

    this.logger.error("Speech synthesis failed", lastFailure, {
      feature: request.feature,
      provider: this.name,
      model: this.options.model,
      latencyMs: Date.now() - startedAt,
    });

    throw lastFailure;
  }

  private async attempt(
    request: TtsSynthesisRequest,
    startedAt: number,
  ): Promise<TtsSynthesisResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(
        `${this.options.baseUrl.replace(/\/+$/, "")}/v1/audio/speech`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            voice: this.options.voice,
            input: request.text,
            response_format: "mp3",
          }),
        },
      );

      if (!response.ok) {
        this.logger.debug("Speech provider returned a non-success status", {
          feature: request.feature,
          provider: this.name,
          status: response.status,
        });

        if (isRetryableStatus(response.status)) {
          throw new RetryableUpstreamError(response.status);
        }

        throw new AiUnavailableError("Audio briefing is not available right now");
      }

      const audio = Buffer.from(await response.arrayBuffer());

      // An empty body is a successful HTTP call that produced nothing playable.
      // Treated as a provider failure rather than returned as silent audio.
      if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
        this.logger.warn("Speech provider returned an unusable payload", {
          feature: request.feature,
          provider: this.name,
          bytes: audio.byteLength,
        });
        throw new AiUnavailableError("Audio briefing is not available right now");
      }

      const result: TtsSynthesisResult = {
        audio,
        contentType: "audio/mpeg",
        format: "mp3",
        provider: this.name,
        model: this.options.model,
        voice: this.options.voice,
        latencyMs: Date.now() - startedAt,
      };

      this.logger.info("Speech synthesis succeeded", {
        feature: request.feature,
        provider: result.provider,
        model: result.model,
        voice: result.voice,
        latencyMs: result.latencyMs,
        bytes: audio.byteLength,
      });

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Everything becomes one of this module's own errors. An `AbortError` is the
   * timeout budget expiring; anything else is treated as the provider being
   * unavailable, because we cannot tell a DNS failure from a TLS failure
   * without inspecting text that must not be trusted.
   */
  private normalise(error: unknown): Error {
    if (error instanceof AiTimeoutError || error instanceof AiUnavailableError) {
      return error;
    }

    if (error instanceof RetryableUpstreamError) {
      return new AiUnavailableError("Audio briefing is not available right now");
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    ) {
      return new AiTimeoutError();
    }

    return new AiUnavailableError("Audio briefing is not available right now");
  }
}

/** Internal marker so `synthesize` knows another attempt is worth making. */
class RetryableUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Upstream returned ${status}`);
    this.name = "RetryableUpstreamError";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
