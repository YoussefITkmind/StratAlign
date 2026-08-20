import type { Logger } from "../../logging/logger";

import { AiTimeoutError, AiUnavailableError } from "./ai.errors";
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider,
} from "./llm.provider";

export interface AnthropicProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  /** Additional attempts after the first, so 2 means up to three calls. */
  readonly maxRetries: number;
}

interface AnthropicTextBlock {
  type: string;
  text?: unknown;
}

interface AnthropicMessageResponse {
  content?: unknown;
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

function extractText(body: AnthropicMessageResponse): string {
  if (!Array.isArray(body.content)) {
    return "";
  }

  return body.content
    .filter((block): block is AnthropicTextBlock =>
      typeof block === "object" && block !== null,
    )
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();
}

/**
 * Anthropic Messages API over `fetch`.
 *
 * Deliberately dependency-free: the backend already targets a Node runtime with
 * global `fetch`, and one HTTP shape is cheaper to own than a vendor SDK whose
 * surface would leak into the service layer.
 *
 * Failures are normalised before they leave this class. An upstream body may
 * echo prompt fragments or account detail, so it is logged at debug level with
 * the status only and never attached to the thrown error.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly isConfigured = true;

  constructor(
    private readonly options: AnthropicProviderOptions,
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
        `${this.options.baseUrl.replace(/\/+$/, "")}/v1/messages`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": this.options.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: this.options.model,
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            system: request.system,
            messages: [{ role: "user", content: request.prompt }],
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

      const body = (await response.json()) as AnthropicMessageResponse;
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

/**
 * Stand-in used when no AI credentials are configured.
 *
 * Refusing loudly at call time beats a silent fallback to canned text: the
 * feature is either wired to a real model or it visibly says it is not.
 */
export class UnconfiguredLlmProvider implements LlmProvider {
  readonly name = "unconfigured";
  readonly model = "none";
  readonly isConfigured = false;

  complete(): Promise<LlmCompletionResult> {
    return Promise.reject(
      new AiUnavailableError(
        "AI suggestions are not configured for this environment",
      ),
    );
  }
}
