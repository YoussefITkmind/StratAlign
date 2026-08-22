import { randomUUID } from "node:crypto";

import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import type { Logger } from "../../logging/logger";
import type { AlignmentService } from "../registry/alignment.service";
import type { KpiRegistryService } from "../registry/kpi-registry.service";
import type { OkrService } from "../registry/okr.service";

import { isUniqueConstraintViolation } from "../../errors/app.errors";
import {
  AiAcceptInProgressError,
  AiDuplicateSuggestionError,
  AiMalformedOutputError,
  AiSuggestionError,
  AiThemeNotFoundError,
} from "./ai.errors";
import type { LlmProvider } from "./llm.provider";
import {
  extractJsonObject,
  llmSuggestionResponseSchema,
  MAX_SUGGESTIONS,
  type LlmSuggestion,
} from "./suggestion.schema";
import {
  buildSuggestionPrompt,
  SUGGESTION_FEATURE,
  SUGGESTION_SYSTEM_PROMPT,
} from "./suggestion.prompt";
import type { ThemeContextBuilder } from "./theme-context.builder";
import type {
  AcceptBatchResult,
  AcceptedSuggestion,
  AcceptFailure,
  SuggestionDuplicateMatch,
  SuggestionKind,
  ThemeSuggestion,
  ThemeSuggestionBatch,
  ThemeSuggestionContext,
} from "./ai-suggestion.types";

/** A candidate at or above this score is shown to the reviewer as a possible
 * duplicate. Chosen well below the blocking floor so near-misses surface. */
const FLAG_SIMILARITY_THRESHOLD = 0.45;

/** At or above this, the candidate is refused on accept unless the reviewer
 * explicitly acknowledges the collision. */
const BLOCK_SIMILARITY_THRESHOLD = 0.9;

/**
 * Global mode's fan-out always asks for both kinds together (kpi + okr) so
 * the ALL/OKR/KPI tabs can filter one fetch instead of re-generating — and a
 * theme with real objectives can return up to `maxSuggestions` OKRs, each
 * with several bilingual key results, which is far more verbose than a KPI.
 * 4,096 was tight enough to truncate that combined output mid-JSON on a
 * theme with real objective context, which the parser then rejects as
 * malformed rather than as a length problem. Doubled for headroom.
 */
const MAX_OUTPUT_TOKENS = 8_192;
const GENERATION_TEMPERATURE = 0.4;

/**
 * How long a losing accept waits for the winning one to publish its subject id.
 * Long enough to cover a KPI creation plus its alignment write; short enough
 * that a caller is not left hanging if the winner died mid-flight.
 */
const CLAIM_WAIT_ATTEMPTS = 40;
const CLAIM_WAIT_INTERVAL_MS = 50;

export interface GenerateSuggestionsInput {
  themeNodeId: string;
  kinds: readonly SuggestionKind[];
  maxSuggestions: number;
}

export interface AcceptKeyResultInput {
  titleEn: string;
  titleAr: string;
  type: "quantitative" | "milestone";
  targetValue: number;
  unit: string;
}

/**
 * What the reviewer sends back. It is the proposal's shape, not a reference to
 * a stored one: nothing is persisted between generation and accept, so the
 * accepted values are whatever the reviewer edited them into.
 */
export interface AcceptSuggestionInput {
  suggestionId: string;
  generationId: string;
  themeNodeId: string;
  kind: SuggestionKind;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  confidence: number;
  provider: string;
  model: string;
  /** Set by the client when the reviewer changed anything before accepting. */
  edited: boolean;
  /** Reviewer saw the duplicate warning and chose to proceed anyway. */
  acknowledgeDuplicate?: boolean;
  kpi?: {
    unit: string;
    frequency: "monthly" | "quarterly";
    polarity: "higher_is_better" | "lower_is_better";
  } | null;
  okr?: {
    objectiveNodeId: string;
    keyResults: AcceptKeyResultInput[];
  } | null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normaliseName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Theme-level AI proposals: generate, then turn the accepted ones into real
 * registry records.
 *
 * The model only ever produces candidates. Creation runs through
 * `KpiRegistryService`, `OkrService`, and `AlignmentService` exactly as the
 * manual flows do, so an accepted item is subject to the same validation,
 * versioning, and approval gating as one typed in by hand. Nothing in this
 * class writes to a KPI or OKR table directly.
 */
export class AiSuggestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextBuilder: ThemeContextBuilder,
    private readonly llm: LlmProvider,
    private readonly kpis: KpiRegistryService,
    private readonly okrs: OkrService,
    private readonly alignments: AlignmentService,
    private readonly eventBus: EventBusService,
    private readonly logger: Logger,
  ) {}

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------

  async generate(
    input: GenerateSuggestionsInput,
  ): Promise<ThemeSuggestionBatch> {
    const generationId = randomUUID();
    const kinds = input.kinds.length > 0 ? input.kinds : (["kpi", "okr"] as const);

    const context = await this.contextBuilder.build(input.themeNodeId);

    const completion = await this.llm.complete({
      system: SUGGESTION_SYSTEM_PROMPT,
      prompt: buildSuggestionPrompt(context, {
        kinds,
        maxSuggestions: Math.min(input.maxSuggestions, MAX_SUGGESTIONS),
      }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: GENERATION_TEMPERATURE,
      feature: SUGGESTION_FEATURE,
    });

    const parsed = this.parseCompletion(completion.text);

    // Anything the model got structurally right can still be wrong about this
    // theme — an objective id it invented, or a kind nobody asked for.
    const usable = parsed.filter((suggestion) =>
      this.isApplicable(suggestion, context, kinds),
    );

    const suggestions = await Promise.all(
      usable.map((suggestion) =>
        this.toReviewable(suggestion, context, generationId),
      ),
    );

    this.logger.info("Generated theme suggestions", {
      feature: SUGGESTION_FEATURE,
      generationId,
      themeNodeId: input.themeNodeId,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      returnedByModel: parsed.length,
      usable: suggestions.length,
      flaggedDuplicates: suggestions.filter(
        (suggestion) => suggestion.duplicateMatches.length > 0,
      ).length,
    });

    return {
      generationId,
      themeNodeId: input.themeNodeId,
      provider: completion.provider,
      model: completion.model,
      latencyMs: completion.latencyMs,
      suggestions,
    };
  }

  /** Structured output or nothing — free text never reaches a domain service. */
  private parseCompletion(text: string): LlmSuggestion[] {
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

    const result = llmSuggestionResponseSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("AI response failed schema validation", {
        feature: SUGGESTION_FEATURE,
        issueCount: result.error.issues.length,
        // Paths only. Issue messages can quote the offending model output.
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data.suggestions;
  }

  private isApplicable(
    suggestion: LlmSuggestion,
    context: ThemeSuggestionContext,
    kinds: readonly SuggestionKind[],
  ): boolean {
    if (!kinds.includes(suggestion.type)) {
      return false;
    }

    if (suggestion.type === "kpi") {
      return true;
    }

    return context.objectives.some(
      (objective) => objective.id === suggestion.objectiveNodeId,
    );
  }

  private async toReviewable(
    suggestion: LlmSuggestion,
    context: ThemeSuggestionContext,
    generationId: string,
  ): Promise<ThemeSuggestion> {
    const duplicateMatches =
      suggestion.type === "kpi"
        ? await this.findKpiDuplicates(suggestion.titleEn)
        : this.findOkrDuplicates(suggestion.titleEn, context);

    return {
      suggestionId: randomUUID(),
      generationId,
      themeNodeId: context.theme.id,
      themeNameEn: context.theme.nameEn,
      kind: suggestion.type,
      titleEn: suggestion.titleEn,
      titleAr: suggestion.titleAr,
      descriptionEn: suggestion.descriptionEn ?? null,
      descriptionAr: suggestion.descriptionAr ?? null,
      confidence: suggestion.confidence,
      rationale: suggestion.rationale ?? null,
      kpi:
        suggestion.type === "kpi"
          ? {
              unit: suggestion.unit as string,
              frequency: suggestion.frequency as "monthly" | "quarterly",
              polarity: suggestion.polarity as
                | "higher_is_better"
                | "lower_is_better",
            }
          : null,
      okr:
        suggestion.type === "okr"
          ? {
              objectiveNodeId: suggestion.objectiveNodeId as string,
              keyResults: (suggestion.keyResults ?? []).map((keyResult) => ({
                titleEn: keyResult.titleEn,
                titleAr: keyResult.titleAr,
                type: keyResult.type,
                targetValue: keyResult.targetValue,
                unit: keyResult.unit,
              })),
            }
          : null,
      duplicateMatches,
    };
  }

  // -------------------------------------------------------------------------
  // Duplicate detection
  // -------------------------------------------------------------------------

  /**
   * Reuses the registry's own trigram search rather than scoring anything here.
   * `KpiRegistryService.findSimilar` is backed by pg_trgm and the GIN indexes
   * the registry migration created; a second implementation would drift from it.
   */
  private async findKpiDuplicates(
    title: string,
  ): Promise<SuggestionDuplicateMatch[]> {
    const matches = await this.kpis.findSimilar({
      text: title,
      threshold: FLAG_SIMILARITY_THRESHOLD,
      limit: 3,
    });

    return matches.map((match) => ({
      kpiDefinitionId: match.kpiDefinitionId,
      okrId: null,
      nameEn: match.nameEn,
      similarity: match.similarity,
    }));
  }

  /**
   * OKRs have no similarity index — the registry never needed one, and adding a
   * second scoring system for this feature is exactly what the design forbids.
   * A normalised name collision within the same theme is the honest check that
   * the existing data supports, so a match here is exact rather than fuzzy.
   */
  private findOkrDuplicates(
    title: string,
    context: ThemeSuggestionContext,
  ): SuggestionDuplicateMatch[] {
    const normalised = normaliseName(title);

    return context.existingOkrs
      .filter((okr) => normaliseName(okr.nameEn) === normalised)
      .map((okr) => ({
        kpiDefinitionId: null,
        okrId: okr.id,
        nameEn: okr.nameEn,
        similarity: 1,
      }));
  }

  // -------------------------------------------------------------------------
  // Accept
  // -------------------------------------------------------------------------

  async accept(
    input: AcceptSuggestionInput,
    actorUserId: string,
  ): Promise<AcceptedSuggestion> {
    return this.acceptOne(input, actorUserId, new Map());
  }

  /**
   * Accepts a batch, item by item.
   *
   * Deliberately not one transaction: a single malformed proposal must not undo
   * the ten valid ones beside it, and each item already carries its own
   * idempotency key. Failures are reported per item so the UI can show exactly
   * what landed. The theme context is built once per theme and reused, so a
   * twelve-item batch is not twelve traversals of the same tree.
   */
  async acceptMany(
    inputs: readonly AcceptSuggestionInput[],
    actorUserId: string,
  ): Promise<AcceptBatchResult> {
    const accepted: AcceptedSuggestion[] = [];
    const failed: AcceptFailure[] = [];
    const contexts = new Map<string, ThemeSuggestionContext>();

    for (const input of inputs) {
      try {
        accepted.push(await this.acceptOne(input, actorUserId, contexts));
      } catch (error) {
        failed.push({
          suggestionId: input.suggestionId,
          reason: this.classifyFailure(error),
          message:
            error instanceof AiSuggestionError
              ? error.message
              : "This suggestion could not be created",
        });
      }
    }

    this.logger.info("Accepted theme suggestions", {
      feature: SUGGESTION_FEATURE,
      actorUserId,
      requested: inputs.length,
      accepted: accepted.length,
      failed: failed.length,
    });

    return { accepted, failed };
  }

  private async acceptOne(
    input: AcceptSuggestionInput,
    actorUserId: string,
    contexts: Map<string, ThemeSuggestionContext>,
  ): Promise<AcceptedSuggestion> {
    const existing = await this.findSettledProvenance(input.suggestionId);

    if (existing) {
      // A retried accept must not produce a second KPI. A settled provenance
      // row is the record that this proposal already became something.
      return {
        suggestionId: input.suggestionId,
        subjectType:
          existing.subjectType === "KPI_DEFINITION" ? "kpi_definition" : "okr",
        subjectId: existing.subjectId,
        alreadyAccepted: true,
        edited: existing.edited,
      };
    }

    const cached = contexts.get(input.themeNodeId);
    const context =
      cached ?? (await this.contextBuilder.build(input.themeNodeId));
    contexts.set(input.themeNodeId, context);

    return input.kind === "kpi"
      ? this.acceptKpi(input, context, actorUserId)
      : this.acceptOkr(input, context, actorUserId);
  }

  private async acceptKpi(
    input: AcceptSuggestionInput,
    context: ThemeSuggestionContext,
    actorUserId: string,
  ): Promise<AcceptedSuggestion> {
    if (!input.kpi) {
      throw new AiSuggestionError("A KPI suggestion requires KPI fields");
    }

    // The claim comes before the duplicate check, not after it. A concurrent
    // second accept would otherwise run its similarity search after the winner
    // had already created the KPI, match that brand-new record, and be refused
    // as a duplicate of itself instead of resolving to it.
    const claimed = await this.claim(input, "KPI_DEFINITION", actorUserId);

    if (!claimed) {
      return this.awaitWinner(input);
    }

    try {
      await this.assertNotBlockedDuplicate(
        await this.findKpiDuplicates(input.titleEn),
        input.acknowledgeDuplicate ?? false,
      );
    } catch (error) {
      // A refused candidate must not consume its suggestion id — the reviewer
      // can acknowledge the collision and accept the same proposal again.
      await this.releaseClaim(input.suggestionId);
      throw error;
    }

    let definitionId: string | null = null;

    try {
      // Owner and activation date are stamped server-side. Letting a proposal
      // choose them would let a caller assign ownership by editing a payload.
      const created = await this.kpis.createDraft({
        nameEn: input.titleEn,
        nameAr: input.titleAr,
        descriptionEn: input.descriptionEn ?? null,
        descriptionAr: input.descriptionAr ?? null,
        unit: input.kpi.unit,
        polarity: input.kpi.polarity,
        frequency: input.kpi.frequency,
        dataSourceType: "manual",
        ownerUserId: actorUserId,
        activeFrom: new Date(),
      });

      definitionId = created.definition.id;

      await this.alignments.set({
        kpiDefinitionId: definitionId,
        alignments: [
          { strategyNodeId: context.theme.id, alignmentType: "theme" },
        ],
      });
    } catch (error) {
      // Nothing was created, so the claim is released and the reviewer can try
      // again. If the KPI already exists the claim is settled instead, because
      // releasing it would let a retry create a second one.
      if (definitionId === null) {
        await this.releaseClaim(input.suggestionId);
      } else {
        await this.settleClaim(input, "KPI_DEFINITION", definitionId, actorUserId);
      }
      throw error;
    }

    await this.settleClaim(input, "KPI_DEFINITION", definitionId, actorUserId);

    return {
      suggestionId: input.suggestionId,
      subjectType: "kpi_definition",
      subjectId: definitionId,
      alreadyAccepted: false,
      edited: input.edited,
    };
  }

  private async acceptOkr(
    input: AcceptSuggestionInput,
    context: ThemeSuggestionContext,
    actorUserId: string,
  ): Promise<AcceptedSuggestion> {
    if (!input.okr || input.okr.keyResults.length === 0) {
      throw new AiSuggestionError(
        "An OKR suggestion requires an objective and at least one key result",
      );
    }

    // Re-checked server-side: the objective must still live under this theme,
    // whatever the client sent.
    const objective = context.objectives.find(
      (candidate) => candidate.id === input.okr?.objectiveNodeId,
    );

    if (!objective) {
      throw new AiSuggestionError(
        "The objective is not part of the selected theme",
      );
    }

    const claimed = await this.claim(input, "OKR", actorUserId);

    if (!claimed) {
      return this.awaitWinner(input);
    }

    try {
      // The context was built before the claim, so it cannot already contain
      // an OKR a concurrent winner just created — but the release-on-refusal
      // rule is the same as for KPIs, and keeping both paths identical is
      // worth more than the micro-optimisation of skipping it.
      await this.assertNotBlockedDuplicate(
        this.findOkrDuplicates(input.titleEn, context),
        input.acknowledgeDuplicate ?? false,
      );
    } catch (error) {
      await this.releaseClaim(input.suggestionId);
      throw error;
    }

    let created: { id: string };

    try {
      created = await this.okrs.create({
        objectiveNodeId: objective.id,
        nameEn: input.titleEn,
        nameAr: input.titleAr,
        keyResults: input.okr.keyResults.map((keyResult) => ({
          type: keyResult.type,
          targetValue: keyResult.targetValue,
          unit: keyResult.unit,
          titleEn: keyResult.titleEn,
          titleAr: keyResult.titleAr,
        })),
      });
    } catch (error) {
      await this.releaseClaim(input.suggestionId);
      throw error;
    }

    await this.settleClaim(input, "OKR", created.id, actorUserId);

    return {
      suggestionId: input.suggestionId,
      subjectType: "okr",
      subjectId: created.id,
      alreadyAccepted: false,
      edited: input.edited,
    };
  }

  private assertNotBlockedDuplicate(
    matches: readonly SuggestionDuplicateMatch[],
    acknowledged: boolean,
  ): Promise<void> {
    if (acknowledged) {
      return Promise.resolve();
    }

    const blocking = matches.find(
      (match) => match.similarity >= BLOCK_SIMILARITY_THRESHOLD,
    );

    if (blocking) {
      return Promise.reject(new AiDuplicateSuggestionError(blocking.nameEn));
    }

    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Provenance
  // -------------------------------------------------------------------------

  /**
   * The settled provenance row for a proposal, if one exists.
   *
   * A row with a null `subjectId` is a claim that has not finished yet — it
   * proves an accept is in flight, not that anything was created, so it is not
   * treated as an answer here.
   */
  private async findSettledProvenance(suggestionId: string): Promise<{
    subjectType: "KPI_DEFINITION" | "OKR";
    subjectId: string;
    edited: boolean;
  } | null> {
    const row = await this.prisma.aiSuggestionProvenance.findUnique({
      where: { suggestionId },
      select: { subjectType: true, subjectId: true, edited: true },
    });

    return row && row.subjectId !== null
      ? {
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          edited: row.edited,
        }
      : null;
  }

  /**
   * Claims the right to create this proposal's record.
   *
   * This insert is the serialisation point, and it deliberately happens before
   * any domain write. Checking for provenance and then creating would leave a
   * window in which two concurrent accepts both read "nothing yet" and both
   * created a KPI; the unique index on `suggestion_id` closes that window,
   * because the loser now fails here rather than after it has already created
   * something.
   *
   * Returns true if this caller won the claim, false if another one holds it.
   * A unique violation is the expected outcome of a lost race, read the same
   * way the rest of the platform reads `isUniqueConstraintViolation`; every
   * other error is a real fault and propagates.
   */
  private async claim(
    input: AcceptSuggestionInput,
    subjectType: "KPI_DEFINITION" | "OKR",
    actorUserId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.aiSuggestionProvenance.create({
        data: {
          suggestionId: input.suggestionId,
          generationId: input.generationId,
          subjectType,
          subjectId: null,
          themeNodeId: input.themeNodeId,
          provider: input.provider,
          model: input.model,
          confidence: input.confidence,
          edited: input.edited,
          // Cast, not coercion: this object is JSON-shaped by construction,
          // but Prisma's InputJsonValue cannot see that through the nested
          // interface types.
          payload: {
            titleEn: input.titleEn,
            titleAr: input.titleAr,
            descriptionEn: input.descriptionEn ?? null,
            descriptionAr: input.descriptionAr ?? null,
            kpi: input.kpi ?? null,
            okr: input.okr ?? null,
          } as Prisma.InputJsonValue,
          acceptedById: actorUserId,
        },
      });

      return true;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Waits for the accept that won the claim to publish what it created.
   *
   * Polling rather than listening: the winner may be in another process, and
   * the platform has no cross-process wait primitive cheaper than a handful of
   * indexed point reads. Bounded, so a caller is never held indefinitely by a
   * winner that died mid-flight.
   */
  private async awaitWinner(
    input: AcceptSuggestionInput,
  ): Promise<AcceptedSuggestion> {
    for (let attempt = 0; attempt < CLAIM_WAIT_ATTEMPTS; attempt += 1) {
      const settled = await this.findSettledProvenance(input.suggestionId);

      if (settled) {
        return {
          suggestionId: input.suggestionId,
          subjectType:
            settled.subjectType === "KPI_DEFINITION" ? "kpi_definition" : "okr",
          subjectId: settled.subjectId,
          alreadyAccepted: true,
          edited: settled.edited,
        };
      }

      await delay(CLAIM_WAIT_INTERVAL_MS);
    }

    this.logger.warn("Timed out waiting for a concurrent accept to settle", {
      feature: SUGGESTION_FEATURE,
      suggestionId: input.suggestionId,
    });

    throw new AiAcceptInProgressError();
  }

  /**
   * Releases a claim that produced nothing, so the proposal can be accepted
   * again. Only ever called when no domain record was created — releasing a
   * claim after a successful creation would let a retry create a second one.
   */
  private async releaseClaim(suggestionId: string): Promise<void> {
    try {
      await this.prisma.aiSuggestionProvenance.deleteMany({
        where: { suggestionId, subjectId: null },
      });
    } catch (error) {
      this.logger.error(
        "Could not release an AI suggestion claim after a failed accept",
        error,
        { feature: SUGGESTION_FEATURE, suggestionId },
      );
    }
  }

  /**
   * Completes the claim with what was created, and announces it on the outbox
   * so the audit journal picks it up through the same path every other domain
   * change uses.
   *
   * A failure here leaves a created record with an unfinished claim. That is a
   * data-quality problem worth shouting about, not a reason to fail an accept
   * whose record already exists — and the claim staying in place is exactly
   * what keeps a later retry from creating a second one.
   */
  private async settleClaim(
    input: AcceptSuggestionInput,
    subjectType: "KPI_DEFINITION" | "OKR",
    subjectId: string,
    actorUserId: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.aiSuggestionProvenance.update({
          where: { suggestionId: input.suggestionId },
          data: { subjectId },
        });

        await this.eventBus.publishWithin(tx, [
          {
            eventType: "registry.ai_suggestion.accepted",
            eventVersion: 1,
            aggregateType:
              subjectType === "KPI_DEFINITION" ? "KpiDefinition" : "Okr",
            aggregateId: subjectId,
            dedupeKey: `registry.ai_suggestion.accepted:${input.suggestionId}`,
            payload: {
              suggestionId: input.suggestionId,
              generationId: input.generationId,
              themeNodeId: input.themeNodeId,
              provider: input.provider,
              model: input.model,
              edited: input.edited,
              acceptedBy: actorUserId,
            },
          },
        ]);
      });

      await this.eventBus.nudgeRelay();
    } catch (error) {
      this.logger.error(
        "Accepted an AI suggestion but could not complete its provenance",
        error,
        {
          feature: SUGGESTION_FEATURE,
          suggestionId: input.suggestionId,
          subjectType,
          subjectId,
        },
      );
    }
  }

  private classifyFailure(error: unknown): AcceptFailure["reason"] {
    if (error instanceof AiDuplicateSuggestionError) {
      return "duplicate";
    }

    if (error instanceof AiAcceptInProgressError) {
      return "in_progress";
    }

    if (error instanceof AiThemeNotFoundError) {
      return "theme_not_found";
    }

    if (error instanceof AiSuggestionError) {
      return "invalid";
    }

    // Registry errors reach here unchanged; their message is domain-safe but
    // the reason a caller branches on is that creation did not happen.
    return "creation_failed";
  }
}
