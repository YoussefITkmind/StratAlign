import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import { AiMalformedOutputError } from "../ai/ai.errors";
import type { LlmProvider } from "../ai/llm.provider";
import { extractJsonObject } from "../ai/suggestion.schema";

import { integrationsErrors } from "./integrations.errors";
import {
  buildInvestigationEvidence,
  type InsufficientReason,
  type InvestigationKind,
  type SyncInvestigationEvidence,
} from "./sync-investigation.evidence";
import {
  applyDiagnosisGuardrails,
  syncDiagnosisSchema,
  type InvestigationConfidence,
  type ValidatedSyncDiagnosis,
} from "./sync-investigation.schema";
import {
  buildSyncInvestigationPrompt,
  SYNC_INVESTIGATION_FEATURE,
  SYNC_INVESTIGATION_SYSTEM_PROMPT,
} from "./sync-investigation.prompt";

const MAX_OUTPUT_TOKENS = 800;
/** Zero: a diagnosis should be reproducible, not creative. */
const TEMPERATURE = 0;
/**
 * How many rows are pulled for one integration. Larger than the number that
 * reaches the prompt because volume history uses successful runs only, which
 * may be sparse among recent failures.
 */
const LOG_FETCH_LIMIT = 60;

export interface SyncInvestigationVolume {
  readonly currentVolume: number;
  readonly historicalAverage: number;
  readonly changePercent: number;
  readonly sampleCount: number;
  readonly isAnomalousDrop: boolean;
}

export interface SyncInvestigationResult {
  readonly syncLogId: string;
  readonly integration: string;
  readonly kind: InvestigationKind;
  /**
   * "ai" when a model produced this text, "deterministic" when the backend
   * refused to spend a call. The UI labels the two differently, so it must not
   * have to infer which happened from the wording.
   */
  readonly source: "ai" | "deterministic";
  readonly diagnosis: string;
  readonly likelyCause: string | null;
  readonly confidence: InvestigationConfidence;
  readonly evidence: string[];
  readonly recommendedActions: string[];
  readonly insufficientData: boolean;
  readonly insufficientReasons: InsufficientReason[];
  readonly volume: SyncInvestigationVolume | null;
  readonly evidenceLogCount: number;
  readonly generatedAt: string;
}

const INSUFFICIENT_ACTIONS = [
  "Review the integration's latest error details in the Connections tab.",
  "Re-run the sync and check whether the same outcome repeats.",
] as const;

/**
 * AI-assisted investigation of one sync run.
 *
 * Strictly read-only: it reads existing `SyncLog` and `Connection` rows, and
 * writes nothing. It never retries a sync, touches a credential, or changes an
 * integration — the recommendations it returns are text for a human to act on.
 *
 * Responsibilities are split deliberately:
 *   - evidence collection and arithmetic live in `sync-investigation.evidence`
 *   - the prompt lives in `sync-investigation.prompt`
 *   - the output contract lives in `sync-investigation.schema`
 * This class only orchestrates them, and owns the one decision that spends
 * money: whether the evidence justifies calling the model at all.
 */
export class SyncInvestigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmProvider,
    private readonly logger: Logger,
  ) {}

  async investigate(syncLogId: string): Promise<SyncInvestigationResult> {
    const syncLog = await this.prisma.syncLog.findUnique({ where: { id: syncLogId } });

    if (!syncLog) {
      throw integrationsErrors.syncLogNotFound();
    }

    const [relatedLogs, connection] = await Promise.all([
      this.prisma.syncLog.findMany({
        where: { integrationName: syncLog.integrationName },
        orderBy: { createdAt: "desc" },
        take: LOG_FETCH_LIMIT,
      }),
      this.prisma.connection.findFirst({ where: { name: syncLog.integrationName } }),
    ]);

    const evidence = buildInvestigationEvidence({ syncLog, relatedLogs, connection });

    this.logger.info("Sync investigation requested", {
      feature: SYNC_INVESTIGATION_FEATURE,
      syncLogId,
      status: syncLog.status,
      kind: evidence.kind,
      relatedLogCount: evidence.relatedLogs.length,
      volumeSampleCount: evidence.volume?.sampleCount ?? 0,
      sufficient: evidence.isSufficient,
    });

    if (!evidence.isSufficient) {
      return this.insufficientResult(evidence);
    }

    const diagnosis = await this.diagnose(evidence);

    return this.toResult(evidence, diagnosis, "ai");
  }

  /**
   * The deterministic answer given when the evidence is too thin to diagnose.
   *
   * Returned instead of calling the model, not in addition to it: a model
   * handed nothing to work with will still produce a fluent cause, which is
   * precisely the outcome this branch exists to prevent — and it costs a call
   * to get it.
   */
  private insufficientResult(evidence: SyncInvestigationEvidence): SyncInvestigationResult {
    const explanation = this.explainInsufficiency(evidence);

    this.logger.info("Sync investigation returned insufficient data without an AI call", {
      feature: SYNC_INVESTIGATION_FEATURE,
      syncLogId: evidence.sync.syncLogId,
      reasons: evidence.insufficientReasons,
    });

    return this.toResult(
      evidence,
      {
        diagnosis: `Insufficient data to determine the likely cause. ${explanation}`,
        likelyCause: null,
        confidence: "low",
        evidence: this.observedFacts(evidence),
        recommendedActions: [...INSUFFICIENT_ACTIONS],
        insufficientData: true,
      },
      "deterministic",
    );
  }

  private explainInsufficiency(evidence: SyncInvestigationEvidence): string {
    if (evidence.sync.status === "SUCCESS" || evidence.sync.status === "RUNNING") {
      return "This sync run reports no failure, and its record volume is not far enough from its own history to be treated as an anomaly.";
    }

    if (evidence.insufficientReasons.includes("NO_ERROR_DETAIL")) {
      return "The run is marked as unsuccessful but carries no error message or error count, so the available information cannot distinguish between a source-system issue, an authentication problem, and a transient sync failure.";
    }

    return "The available sync information does not contain enough evidence to identify a specific cause.";
  }

  /** Plain restatements of what was recorded — no inference, no model text. */
  private observedFacts(evidence: SyncInvestigationEvidence): string[] {
    const { sync, volume } = evidence;
    const facts = [
      `Sync run status: ${sync.status} (${sync.errorCount} recorded error${sync.errorCount === 1 ? "" : "s"}).`,
    ];

    if (sync.message.trim().length > 0) {
      facts.push(`Recorded message: ${sync.message}`);
    }

    if (volume) {
      facts.push(
        `Inbound volume ${volume.currentVolume} against an average of ${volume.historicalAverage} over ${volume.sampleCount} previous successful run(s).`,
      );
    } else {
      facts.push("No comparable historical volume is available for this integration.");
    }

    return facts;
  }

  private async diagnose(evidence: SyncInvestigationEvidence): Promise<ValidatedSyncDiagnosis> {
    const completion = await this.llm.complete({
      system: SYNC_INVESTIGATION_SYSTEM_PROMPT,
      prompt: buildSyncInvestigationPrompt(evidence),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: SYNC_INVESTIGATION_FEATURE,
    });

    const diagnosis = this.parseCompletion(completion.text, evidence);

    this.logger.info("Sync investigation diagnosed", {
      feature: SYNC_INVESTIGATION_FEATURE,
      syncLogId: evidence.sync.syncLogId,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      confidence: diagnosis.confidence,
      insufficientData: diagnosis.insufficientData,
      evidenceItemCount: diagnosis.evidence.length,
      actionCount: diagnosis.recommendedActions.length,
    });

    return diagnosis;
  }

  private parseCompletion(
    text: string,
    evidence: SyncInvestigationEvidence,
  ): ValidatedSyncDiagnosis {
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

    const result = syncDiagnosisSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("Sync investigation response failed schema validation", {
        feature: SYNC_INVESTIGATION_FEATURE,
        syncLogId: evidence.sync.syncLogId,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return applyDiagnosisGuardrails(result.data);
  }

  private toResult(
    evidence: SyncInvestigationEvidence,
    diagnosis: ValidatedSyncDiagnosis,
    source: "ai" | "deterministic",
  ): SyncInvestigationResult {
    return {
      syncLogId: evidence.sync.syncLogId,
      integration: evidence.sync.integration,
      kind: evidence.kind,
      source,
      diagnosis: diagnosis.diagnosis,
      likelyCause: diagnosis.likelyCause,
      confidence: diagnosis.confidence,
      evidence: [...diagnosis.evidence],
      recommendedActions: [...diagnosis.recommendedActions],
      insufficientData: diagnosis.insufficientData,
      insufficientReasons: [...evidence.insufficientReasons],
      volume: evidence.volume
        ? {
            currentVolume: evidence.volume.currentVolume,
            historicalAverage: evidence.volume.historicalAverage,
            changePercent: evidence.volume.changePercent,
            sampleCount: evidence.volume.sampleCount,
            isAnomalousDrop: evidence.volume.isAnomalousDrop,
          }
        : null,
      evidenceLogCount: evidence.relatedLogs.length,
      generatedAt: new Date().toISOString(),
    };
  }
}
