import type { Logger } from "../../logging/logger";

import {
  AnthropicLlmProvider,
  UnconfiguredLlmProvider,
} from "./anthropic.provider";
import { OpenAiLlmProvider } from "./openai.provider";
import type { LlmProvider } from "./llm.provider";

export interface LlmProviderConfig {
  readonly provider: "anthropic" | "openai" | "disabled";
  readonly apiKey?: string;
  /** Falls back to a provider-specific default when unset. */
  readonly model?: string;
  /** Falls back to a provider-specific default when unset. */
  readonly baseUrl?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

/** Vendor-specific defaults, used only when the environment leaves them unset. */
const PROVIDER_DEFAULTS = {
  anthropic: { model: "claude-sonnet-5", baseUrl: "https://api.anthropic.com" },
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com" },
} as const;

/**
 * Single construction point for the platform's LLM client.
 *
 * `disabled`, and a configured provider missing its key, both resolve to the
 * refusing placeholder rather than throwing at boot: the rest of the platform
 * must start and serve every non-AI route in an environment with no AI
 * credentials, which is the normal case for local development and CI.
 */
export function createLlmProvider(
  config: LlmProviderConfig,
  logger: Logger,
): LlmProvider {
  if (config.provider === "disabled") {
    logger.info("AI provider disabled by configuration");
    return new UnconfiguredLlmProvider();
  }

  if (!config.apiKey) {
    logger.warn(
      "AI provider selected without an API key; AI features will refuse",
      { provider: config.provider },
    );
    return new UnconfiguredLlmProvider();
  }

  const defaults = PROVIDER_DEFAULTS[config.provider];
  const options = {
    apiKey: config.apiKey,
    model: config.model ?? defaults.model,
    baseUrl: config.baseUrl ?? defaults.baseUrl,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  };

  return config.provider === "openai"
    ? new OpenAiLlmProvider(options, logger)
    : new AnthropicLlmProvider(options, logger);
}
