import type { Logger } from "../../logging/logger";
import { AiMalformedOutputError } from "../ai/ai.errors";
import type { LlmProvider } from "../ai/llm.provider";
import { extractJsonObject } from "../ai/suggestion.schema";

import { SyncRunNotFoundError } from "../sync-logs/sync-log.errors";
import {
  INVESTIGATION_FEATURE,
  INVESTIGATION_SYSTEM_PROMPT,
  buildInvestigationPrompt,
} from "./investigation.prompt";
import {
  investigationOutputSchema,
  type InvestigationOutput,
} from "./investigation.schema";
import type {
  SyncInvestigationContext,
  SyncInvestigationResult,
  SyncRunReader,
} from "./sync-investigation.types";
import { computeVolumeAnomaly } from "./volume-anomaly";

const MAX_HISTORICAL_RUNS = 5;
const MAX_OUTPUT_TOKENS = 1_024;
const GENERATION_TEMPERATURE = 0.3;

export interface InvestigateInput {
  syncRunId: string;
}

/**
 * AI investigation for a single sync run.
 *
 * `SyncRunReader ↓ AI Investigation Service ↓ LlmProvider` is the whole
 * chain: this class builds the evidence context, reuses the platform's
 * existing LLM provider abstraction from Task 3/4 for the completion, and
 * validates the result before anything downstream sees it. It never writes
 * anything — investigation only ever reads and explains.
 */
export class SyncInvestigationService {
  constructor(
    private readonly reader: SyncRunReader,
    private readonly llm: LlmProvider,
    private readonly logger: Logger,
  ) {}

  async investigate(input: InvestigateInput): Promise<SyncInvestigationResult> {
    const context = await this.buildContext(input.syncRunId);

    const completion = await this.llm.complete({
      system: INVESTIGATION_SYSTEM_PROMPT,
      prompt: buildInvestigationPrompt(context),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: GENERATION_TEMPERATURE,
      feature: INVESTIGATION_FEATURE,
    });

    const parsed = this.parseCompletion(completion.text);

    this.logger.info("Generated sync investigation", {
      feature: INVESTIGATION_FEATURE,
      syncRunId: context.syncRun.id,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      insufficientData: parsed.insufficientData,
    });

    return {
      syncRunId: context.syncRun.id,
      diagnosis: parsed.diagnosis,
      likelyCause: parsed.likelyCause,
      recommendedNextSteps: parsed.recommendedNextSteps,
      confidence: parsed.confidence,
      insufficientData: parsed.insufficientData,
      evidence: parsed.evidence,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
    };
  }

  private async buildContext(syncRunId: string): Promise<SyncInvestigationContext> {
    const syncRun = await this.reader.getById(syncRunId);

    if (!syncRun) {
      throw new SyncRunNotFoundError();
    }

    const historicalRuns = await this.reader.listRecentSuccessful(
      syncRun.sourceKey,
      syncRun.id,
      MAX_HISTORICAL_RUNS,
    );

    const historicalVolumes = historicalRuns
      .map((run) => run.recordsProcessed)
      .filter((value): value is number => value !== null);

    return {
      syncRun,
      volumeAnomaly: computeVolumeAnomaly(syncRun.recordsProcessed, historicalVolumes),
    };
  }

  /** Structured output or nothing — free text never reaches a caller. */
  private parseCompletion(text: string): InvestigationOutput {
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

    const result = investigationOutputSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("AI investigation response failed schema validation", {
        feature: INVESTIGATION_FEATURE,
        issueCount: result.error.issues.length,
        // Paths only. Issue messages can quote the offending model output.
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data;
  }
}
