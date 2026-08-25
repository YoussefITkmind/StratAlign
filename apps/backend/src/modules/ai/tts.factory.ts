import type { Logger } from "../../logging/logger";

import { OpenAiTtsProvider } from "./openai-tts.provider";
import { UnconfiguredTtsProvider, type TtsProvider } from "./tts.provider";

export interface TtsProviderConfig {
  readonly provider: "openai" | "disabled";
  readonly apiKey?: string;
  readonly model: string;
  readonly voice: string;
  /** Falls back to OpenAI's public endpoint when unset. */
  readonly baseUrl?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

const OPENAI_BASE_URL = "https://api.openai.com";

/**
 * Single construction point for the platform's speech client.
 *
 * `disabled`, and a configured provider missing its key, both resolve to the
 * refusing placeholder rather than throwing at boot — same contract as
 * `createLlmProvider`, and for the same reason: every non-AI route must still
 * serve in an environment with no AI credentials.
 */
export function createTtsProvider(
  config: TtsProviderConfig,
  logger: Logger,
): TtsProvider {
  if (config.provider === "disabled") {
    logger.info("Text-to-speech disabled by configuration");
    return new UnconfiguredTtsProvider();
  }

  if (!config.apiKey) {
    logger.warn(
      "Text-to-speech selected without an API key; the audio brief will refuse",
      { provider: config.provider },
    );
    return new UnconfiguredTtsProvider();
  }

  return new OpenAiTtsProvider(
    {
      apiKey: config.apiKey,
      model: config.model,
      voice: config.voice,
      baseUrl: config.baseUrl ?? OPENAI_BASE_URL,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
    },
    logger,
  );
}
