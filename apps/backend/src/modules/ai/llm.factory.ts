import type { Logger } from "../../logging/logger";

import {
  AnthropicLlmProvider,
  UnconfiguredLlmProvider,
} from "./anthropic.provider";
import type { LlmProvider } from "./llm.provider";

export interface LlmProviderConfig {
  readonly provider: "anthropic" | "disabled";
  readonly apiKey?: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

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

  return new AnthropicLlmProvider(
    {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    },
    logger,
  );
}
