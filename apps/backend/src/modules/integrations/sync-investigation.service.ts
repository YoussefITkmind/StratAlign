import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import { AiMalformedOutputError } from "../ai/ai.errors";
import type { LlmProvider } from "../ai/llm.provider";
import {
  buildSyncInvestigationPrompt,
  SYNC_INVESTIGATION_FEATURE,
  SYNC_INVESTIGATION_SYSTEM_PROMPT,
} from "../ai/sync-investigation.prompt";
import {
  syncInvestigationAnswerSchema,
  type SyncInvestigationFinding,
} from "../ai/sync-investigation.schema";
import { extractJsonObject } from "../ai/suggestion.schema";
import { integrationsErrors } from "./integrations.errors";

const MAX_OUTPUT_TOKENS = 1_024;
/** Low: this investigates supplied log evidence, it does not brainstorm. */
const TEMPERATURE = 0.2;
const MAX_LOGS_INVESTIGATED = 20;

export interface SyncInvestigationResult {
  summary: string;
  findings: SyncInvestigationFinding[];
  provider: string;
  model: string;
}

/**
 * Turns the platform's own failed sync logs into an AI-diagnosed root cause
 * and recommendation per integration.
 *
 * Follows `ContextAwareAssistantService`'s shape: structured output only,
 * validated once against a fixed schema before it reaches a caller.
 */
export class SyncInvestigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmProvider,
    private readonly logger: Logger,
  ) {}

  async investigateFailures(): Promise<SyncInvestigationResult> {
    const failed = await this.prisma.syncLog.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: MAX_LOGS_INVESTIGATED,
    });

    if (failed.length === 0) {
      throw integrationsErrors.noSyncFailures();
    }

    const completion = await this.llm.complete({
      system: SYNC_INVESTIGATION_SYSTEM_PROMPT,
      prompt: buildSyncInvestigationPrompt(failed),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: SYNC_INVESTIGATION_FEATURE,
    });

    const answer = this.parseCompletion(completion.text);

    this.logger.info("Investigated failed sync logs", {
      feature: SYNC_INVESTIGATION_FEATURE,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      failedLogsConsidered: failed.length,
      findingsReturned: answer.findings.length,
    });

    return {
      summary: answer.summary,
      findings: answer.findings,
      provider: completion.provider,
      model: completion.model,
    };
  }

  private parseCompletion(text: string): {
    summary: string;
    findings: SyncInvestigationFinding[];
  } {
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

    const result = syncInvestigationAnswerSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("Sync investigation response failed schema validation", {
        feature: SYNC_INVESTIGATION_FEATURE,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data;
  }
}
