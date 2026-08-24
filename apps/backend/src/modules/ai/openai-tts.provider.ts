import type { Logger } from "../../logging/logger";

import { AiTimeoutError, AiUnavailableError } from "./ai.errors";
import type { TtsProvider, TtsRequest, TtsResult } from "./tts.provider";

export interface OpenAiTtsProviderOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Additional attempts after the first, so 2 means up to three calls. */
  readonly maxRetries: number;
}

/** Status codes where another attempt is plausibly a different outcome. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1000ms … capped. Deterministic so tests can advance timers.
  return Math.min(250 * 2 ** attempt, 4_000);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * OpenAI text-to-speech (`/v1/audio/speech`) over `fetch`.
 *
 * Mirrors `OpenAiLlmProvider`: dependency-free, same retry/backoff and error
 * normalisation, and the upstream response body (audio bytes, or an error
 * body that may echo the input text) never leaves this class except as a
 * status code and a `Buffer`.
 */
export class OpenAiTtsProvider implements TtsProvider {
  readonly name = "openai";
  readonly isConfigured = true;

  constructor(
    private readonly options: OpenAiTtsProviderOptions,
    private readonly logger: Logger,
  ) {}

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const startedAt = Date.now();
    let lastFailure: Error = new AiUnavailableError(
      "Text-to-speech is unavailable right now",
    );

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

        this.logger.warn("Retrying text-to-speech", {
          feature: request.feature,
          provider: this.name,
          attempt: attempt + 1,
        });

        await delay(backoffMs(attempt));
      }
    }

    this.logger.error("Text-to-speech failed", lastFailure, {
      feature: request.feature,
      provider: this.name,
      model: request.model,
      latencyMs: Date.now() - startedAt,
    });

    throw lastFailure;
  }

  private async attempt(request: TtsRequest, startedAt: number): Promise<TtsResult> {
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
            model: request.model,
            voice: request.voice,
            input: request.text,
            response_format: "mp3",
          }),
        },
      );

      if (!response.ok) {
        this.logger.debug("TTS provider returned a non-success status", {
          feature: request.feature,
          provider: this.name,
          status: response.status,
        });

        if (isRetryableStatus(response.status)) {
          throw new RetryableUpstreamError(response.status);
        }

        throw new AiUnavailableError("Text-to-speech is unavailable right now");
      }

      const audio = Buffer.from(await response.arrayBuffer());

      const result: TtsResult = {
        audio,
        mimeType: "audio/mpeg",
        provider: this.name,
        model: request.model,
        latencyMs: Date.now() - startedAt,
      };

      this.logger.info("Text-to-speech succeeded", {
        feature: request.feature,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        audioBytes: audio.byteLength,
      });

      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Everything becomes one of this module's own errors, the same rule
   * `OpenAiLlmProvider.normalise` applies: an `AbortError` is the timeout
   * budget expiring, and anything else is treated as the provider being
   * unavailable.
   */
  private normalise(error: unknown): Error {
    if (error instanceof AiTimeoutError || error instanceof AiUnavailableError) {
      return error;
    }

    if (error instanceof RetryableUpstreamError) {
      return new AiUnavailableError("Text-to-speech is unavailable right now");
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    ) {
      return new AiTimeoutError("The text-to-speech service took too long to respond");
    }

    return new AiUnavailableError("Text-to-speech is unavailable right now");
  }
}

/** Internal marker so `synthesize` knows another attempt is worth making. */
class RetryableUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Upstream returned ${status}`);
    this.name = "RetryableUpstreamError";
  }
}

/** Refuses outright — used when no OpenAI API key is configured. */
export class UnconfiguredTtsProvider implements TtsProvider {
  readonly name = "unconfigured";
  readonly isConfigured = false;

  synthesize(): Promise<TtsResult> {
    return Promise.reject(
      new AiUnavailableError("Text-to-speech is unavailable right now"),
    );
  }
}
