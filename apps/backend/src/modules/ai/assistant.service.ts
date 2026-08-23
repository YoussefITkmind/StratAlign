import type { Logger } from "../../logging/logger";

import { AiMalformedOutputError } from "./ai.errors";
import { extractJsonObject } from "./suggestion.schema";
import {
  askAssistantInputSchema,
  assistantAnswerSchema,
  type AskAssistantValidatedInput,
} from "./assistant.schema";
import { ASSISTANT_FEATURE, buildAssistantPrompt, ASSISTANT_SYSTEM_PROMPT } from "./assistant.prompt";
import type { LlmProvider } from "./llm.provider";
import type { AskAssistantInput, AssistantAnswer } from "./assistant.types";

const MAX_OUTPUT_TOKENS = 1_024;
/** Low: this assistant explains supplied data, it does not brainstorm. */
const TEMPERATURE = 0.2;

/**
 * The global, context-aware StratAlign AI assistant.
 *
 * Deliberately module-agnostic: everything it knows about "where the user is"
 * arrives as `input.context`, already assembled by the frontend's context
 * resolver. This class never inspects a route, never queries a domain module
 * directly, and never branches on a specific module id — a new module context
 * provider on the frontend is the only thing a future module needs to add.
 *
 * Like `AiSuggestionService`, structured output is the only thing that
 * reaches a caller: free text from the model is parsed once, validated
 * against a fixed schema, and rejected outright if it does not match.
 */
export class ContextAwareAssistantService {
  constructor(
    private readonly llm: LlmProvider,
    private readonly logger: Logger,
  ) {}

  async ask(input: AskAssistantInput): Promise<AssistantAnswer> {
    const validated = askAssistantInputSchema.parse(input);

    const completion = await this.llm.complete({
      system: ASSISTANT_SYSTEM_PROMPT,
      prompt: buildAssistantPrompt(validated),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: ASSISTANT_FEATURE,
    });

    const answer = this.parseCompletion(completion.text, validated);

    this.logger.info("Answered assistant question", {
      feature: ASSISTANT_FEATURE,
      module: validated.context.module,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      grounded: answer.grounded,
      insufficientContext: answer.insufficientContext,
    });

    return answer;
  }

  private parseCompletion(
    text: string,
    input: AskAssistantValidatedInput,
  ): AssistantAnswer {
    if (!text.trim()) {
      throw new AiMalformedOutputError("The AI service returned no content");
    }

    const json = extractJsonObject(text);

    if (!json) {
      throw new AiMalformedOutputError();
    }

    let decoded: unknown;

    try {
      decoded = JSON.parse(json);
    } catch {
      throw new AiMalformedOutputError();
    }

    const result = assistantAnswerSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("Assistant response failed schema validation", {
        feature: ASSISTANT_FEATURE,
        module: input.context.module,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data;
  }
}
