import type { Logger } from "../../logging/logger";

import { AiTimeoutError, AiUnavailableError } from "./ai.errors";
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from "./llm.provider";

export interface OpenAiProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Additional attempts after the first, so 2 means up to three calls. */
  readonly maxRetries: number;
}

interface OpenAiChoice {
  message?: { content?: unknown };
}

interface OpenAiChatCompletionResponse {
  choices?: unknown;
  model?: unknown;
}

/** Status codes where another attempt is plausibly a different outcome. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function backoffMs(attempt: number): number {
  // 250ms, 500ms, 1000ms … capped. Deterministic so tests can advance timers.
  return Math.min(250 * 2 ** attempt, 4_000);
}

function extractText(body: OpenAiChatCompletionResponse): string {
  if (!Array.isArray(body.choices)) {
    return "";
  }

  return body.choices
    .filter((choice): choice is OpenAiChoice =>
      typeof choice === "object" && choice !== null,
    )
    .map((choice) =>
      typeof choice.message?.content === "string" ? choice.message.content : "",
    )
    .join("")
    .trim();
}

/**
 * OpenAI Chat Completions API over `fetch`.
 *
 * Mirrors `AnthropicLlmProvider`: dependency-free, normalises every failure
 * to this module's own error types, and never lets an upstream body (which
 * may echo prompt fragments) leave this class except as a status code.
 */
export class OpenAiLlmProvider implements LlmProvider {
  readonly name = "openai";
  readonly isConfigured = true;

  constructor(
    private readonly options: OpenAiProviderOptions,
    private readonly logger: Logger,
  ) {}

  get model(): string {
    return this.options.model;
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResult> {
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

        this.logger.warn("Retrying AI completion", {
          feature: request.feature,
          provider: this.name,
          attempt: attempt + 1,
        });

        await delay(backoffMs(attempt));
      }
    }

    this.logger.error("AI completion failed", lastFailure, {
      feature: request.feature,
      provider: this.name,
      model: this.options.model,
      latencyMs: Date.now() - startedAt,
    });

    throw lastFailure;
  }

  private async attempt(
    request: LlmCompletionRequest,
    startedAt: number,
  ): Promise<LlmCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );

    try {
      const response = await fetch(
        `${this.options.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify({
            model: this.options.model,
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
          }),
        },
      );

      if (!response.ok) {
        this.logger.debug("AI provider returned a non-success status", {
          feature: request.feature,
          provider: this.name,
          status: response.status,
        });

        if (isRetryableStatus(response.status)) {
          throw new RetryableUpstreamError(response.status);
        }

        throw new AiUnavailableError();
      }

      const body = (await response.json()) as OpenAiChatCompletionResponse;
      const text = extractText(body);

      const result: LlmCompletionResult = {
        text,
        provider: this.name,
        model:
          typeof body.model === "string" ? body.model : this.options.model,
        latencyMs: Date.now() - startedAt,
      };

      this.logger.info("AI completion succeeded", {
        feature: request.feature,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        outputCharacters: text.length,
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
      return new AiUnavailableError();
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
    ) {
      return new AiTimeoutError();
    }

    return new AiUnavailableError();
  }
}

/** Internal marker so `complete` knows another attempt is worth making. */
class RetryableUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Upstream returned ${status}`);
    this.name = "RetryableUpstreamError";
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
