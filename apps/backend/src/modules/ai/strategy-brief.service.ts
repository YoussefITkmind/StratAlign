import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";

import { AiBriefNotFoundError, AiMalformedOutputError } from "./ai.errors";
import type { LlmProvider } from "./llm.provider";
import type { StrategyBriefCollector } from "./strategy-brief.collector";
import {
  briefSectionEditSchema,
  storedStrategyBriefSchema,
  strategyBriefNarrativeSchema,
  type BriefSectionEdit,
  type LlmStrategyBriefNarrative,
} from "./strategy-brief.schema";
import {
  buildStrategyBriefPrompt,
  STRATEGY_BRIEF_FEATURE,
  STRATEGY_BRIEF_SYSTEM_PROMPT,
} from "./strategy-brief.prompt";
import type {
  BriefRisk,
  BriefSection,
  StrategyBrief,
  StrategyBriefSnapshot,
} from "./strategy-brief.types";
import { extractJsonObject } from "./suggestion.schema";

const MAX_OUTPUT_TOKENS = 2_048;
/** Low: this brief reports on supplied data, it does not brainstorm. */
const TEMPERATURE = 0.3;

/** Shown when the hierarchy itself cannot support a brief. Never model text. */
const INSUFFICIENT_SUMMARY =
  "There is insufficient strategy data to produce an executive brief. Add strategic themes and objectives to the hierarchy, then generate the brief again.";

interface BriefOverrides {
  executiveSummaryOverride: string | null;
  strategicVisionOverride: string | null;
  generatedAt: Date;
}

interface StoredBriefRow extends BriefOverrides {
  rootNodeId: string;
  payload: unknown;
}

function aiSection(content: string | null): BriefSection {
  return { content, source: content === null ? "none" : "ai", aiContent: content };
}

/**
 * Applies a user's stored edits over the model's version.
 *
 * A non-null override *is* the edited flag — there is no separate boolean to
 * fall out of step with the text. `aiContent` is carried through untouched so
 * the UI can offer to revert to what the model wrote.
 */
function applyOverrides(brief: StrategyBrief, overrides: BriefOverrides): StrategyBrief {
  const override = (section: BriefSection, value: string | null): BriefSection =>
    value === null ? section : { ...section, content: value, source: "user" };

  return {
    ...brief,
    generatedAt: overrides.generatedAt.toISOString(),
    executiveSummary: override(brief.executiveSummary, overrides.executiveSummaryOverride),
    strategicVision: override(brief.strategicVision, overrides.strategicVisionOverride),
  };
}

/**
 * Generates, stores, reads back, and edits the AI Strategy Brief.
 *
 * The division of labour is the point of this class. Facts — themes, their
 * objective counts, objective names, owners, progress figures, health — are
 * copied from the collector's snapshot and are *never* read out of the model's
 * answer, so no prompt failure can put an invented owner or percentage in
 * front of an executive. The model contributes only narrative, and even that
 * is re-grounded here: a risk naming an area that is not a real theme has the
 * area cleared, and risks are dropped entirely when the snapshot detected no
 * concerns to write about.
 */
export class StrategyBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collector: StrategyBriefCollector,
    private readonly llm: LlmProvider,
    private readonly logger: Logger,
  ) {}

  /** The stored brief for a strategy, or null when none has been generated. */
  async get(rootNodeId?: string): Promise<StrategyBrief | null> {
    const snapshot = await this.collector.collect(rootNodeId);
    const row = await this.prisma.strategyBrief.findUnique({
      where: { rootNodeId: snapshot.rootNodeId },
    });

    if (!row) {
      return null;
    }

    return this.hydrate(row);
  }

  async generate(input: {
    rootNodeId?: string;
    actorUserId: string;
  }): Promise<StrategyBrief> {
    const snapshot = await this.collector.collect(input.rootNodeId);
    const existing = await this.prisma.strategyBrief.findUnique({
      where: { rootNodeId: snapshot.rootNodeId },
      select: { executiveSummaryOverride: true, strategicVisionOverride: true },
    });

    // An empty hierarchy is settled before any spend: there is nothing for a
    // model to be right or wrong about, and the message the user reads must
    // not depend on what a model chose to say.
    const brief = snapshot.insufficientData
      ? this.composeInsufficient(snapshot)
      : await this.composeFromModel(snapshot);

    await this.persist(brief, input.actorUserId);

    this.logger.info("Generated strategy brief", {
      feature: STRATEGY_BRIEF_FEATURE,
      rootNodeId: snapshot.rootNodeId,
      themes: brief.strategicThemes.length,
      objectives: brief.strategicObjectives.length,
      risks: brief.risks.length,
      insufficientData: brief.insufficientData,
      provider: brief.provider,
      model: brief.model,
    });

    // A regeneration refreshes the model's text but must not silently drop an
    // edit a human made — the caller sees exactly what a reload would show.
    return existing
      ? applyOverrides(brief, { ...existing, generatedAt: new Date(brief.generatedAt) })
      : brief;
  }

  /**
   * Records or clears a manual edit to one section.
   *
   * Editing never re-runs the model, and generation never silently discards an
   * edit — the two write different columns. Passing `null` reverts the section
   * to the model's own text.
   */
  async updateSection(input: {
    rootNodeId?: string;
    edit: BriefSectionEdit;
  }): Promise<StrategyBrief> {
    const edit = briefSectionEditSchema.parse(input.edit);
    const snapshot = await this.collector.collect(input.rootNodeId);

    const existing = await this.prisma.strategyBrief.findUnique({
      where: { rootNodeId: snapshot.rootNodeId },
    });

    if (!existing) {
      throw new AiBriefNotFoundError();
    }

    const updated = await this.prisma.strategyBrief.update({
      where: { rootNodeId: snapshot.rootNodeId },
      data:
        edit.section === "executiveSummary"
          ? { executiveSummaryOverride: edit.content }
          : { strategicVisionOverride: edit.content },
    });

    const hydrated = this.hydrate(updated);

    if (!hydrated) {
      throw new AiMalformedOutputError("The stored brief could not be read back");
    }

    return hydrated;
  }

  /** Revalidates a stored payload before it is trusted, then applies edits. */
  private hydrate(row: StoredBriefRow): StrategyBrief | null {
    const parsed = storedStrategyBriefSchema.safeParse(row.payload);

    if (!parsed.success) {
      this.logger.warn("Stored strategy brief failed schema validation", {
        feature: STRATEGY_BRIEF_FEATURE,
        rootNodeId: row.rootNodeId,
        issuePaths: parsed.error.issues.map((issue) => issue.path.join(".")),
      });
      return null;
    }

    return applyOverrides(parsed.data as StrategyBrief, row);
  }

  private async composeFromModel(snapshot: StrategyBriefSnapshot): Promise<StrategyBrief> {
    const completion = await this.llm.complete({
      system: STRATEGY_BRIEF_SYSTEM_PROMPT,
      prompt: buildStrategyBriefPrompt(snapshot),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      feature: STRATEGY_BRIEF_FEATURE,
    });

    const narrative = this.parseCompletion(completion.text, snapshot);

    return {
      ...this.factualSections(snapshot),
      generatedAt: new Date().toISOString(),
      executiveSummary: aiSection(narrative.executiveSummary),
      strategicVision: this.resolveVision(snapshot, narrative),
      expectedOutcomes: narrative.expectedOutcomes,
      risks: this.groundRisks(narrative.risks, snapshot),
      insufficientData: narrative.insufficientData,
      insufficientDataReason: narrative.insufficientData
        ? (narrative.insufficientDataReason?.trim() ?? null)
        : null,
      provider: completion.provider,
      model: completion.model,
    };
  }

  /**
   * The deterministic brief for a hierarchy that cannot support one.
   *
   * No model call, no narrative, and no invented risk — just the facts that do
   * exist plus an honest statement of what is missing.
   */
  private composeInsufficient(snapshot: StrategyBriefSnapshot): StrategyBrief {
    return {
      ...this.factualSections(snapshot),
      generatedAt: new Date().toISOString(),
      executiveSummary: { content: INSUFFICIENT_SUMMARY, source: "ai", aiContent: INSUFFICIENT_SUMMARY },
      strategicVision: this.resolveVision(snapshot, null),
      expectedOutcomes: [],
      risks: [],
      insufficientData: true,
      insufficientDataReason: snapshot.insufficientDataReason,
      provider: this.llm.name,
      model: this.llm.model,
    };
  }

  /** Everything copied verbatim from the snapshot, never from the model. */
  private factualSections(snapshot: StrategyBriefSnapshot) {
    return {
      rootNodeId: snapshot.rootNodeId,
      title: snapshot.title,
      strategicThemes: snapshot.themes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        objectiveCount: theme.objectiveCount,
      })),
      strategicObjectives: snapshot.objectives.map((objective) => ({
        id: objective.id,
        name: objective.name,
        themeId: objective.themeId,
        themeName: objective.themeName,
        owner: objective.owner,
        progress: objective.progress,
        health: objective.status,
      })),
    };
  }

  /**
   * The strategy's own vision wins whenever it has one — the model is never
   * allowed to rewrite an authored statement. Its `visionSummary` is used only
   * to fill a genuine gap, and a gap it declined to fill stays empty rather
   * than being papered over.
   */
  private resolveVision(
    snapshot: StrategyBriefSnapshot,
    narrative: LlmStrategyBriefNarrative | null,
  ): BriefSection {
    if (snapshot.vision) {
      return { content: snapshot.vision, source: "strategy", aiContent: null };
    }

    const drafted = narrative?.visionSummary?.trim();
    return aiSection(drafted ? drafted : null);
  }

  /**
   * Keeps only risks the snapshot actually justifies.
   *
   * The prompt forbids inventing a risk, but a prompt is a request, not a
   * guarantee. Two checks make it one: with no signals detected, every risk is
   * dropped; and an `area` that does not name a real theme is cleared rather
   * than shown, so a brief can never attribute a concern to a theme that does
   * not exist.
   */
  private groundRisks(
    risks: LlmStrategyBriefNarrative["risks"],
    snapshot: StrategyBriefSnapshot,
  ): BriefRisk[] {
    if (snapshot.riskSignals.length === 0) {
      if (risks.length > 0) {
        this.logger.warn("Discarded model risks with no supporting signals", {
          feature: STRATEGY_BRIEF_FEATURE,
          rootNodeId: snapshot.rootNodeId,
          discarded: risks.length,
        });
      }
      return [];
    }

    const themeNames = new Map(
      snapshot.themes.map((theme) => [theme.name.toLowerCase(), theme.name]),
    );

    return risks.map((risk) => {
      const matched = risk.area ? themeNames.get(risk.area.trim().toLowerCase()) : undefined;
      return {
        severity: risk.severity,
        title: risk.title,
        mitigation: risk.mitigation,
        area: matched ?? null,
      };
    });
  }

  private parseCompletion(
    text: string,
    snapshot: StrategyBriefSnapshot,
  ): LlmStrategyBriefNarrative {
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

    const result = strategyBriefNarrativeSchema.safeParse(decoded);

    if (!result.success) {
      this.logger.warn("Strategy brief response failed schema validation", {
        feature: STRATEGY_BRIEF_FEATURE,
        rootNodeId: snapshot.rootNodeId,
        issuePaths: result.error.issues.map((issue) => issue.path.join(".")),
      });
      throw new AiMalformedOutputError();
    }

    return result.data;
  }

  /**
   * Upserts the brief for this strategy. One row per root: a brief describes
   * the strategy as it stands, so regenerating replaces rather than accumulates.
   * User overrides are left untouched — see the model comment in schema.prisma.
   */
  private async persist(brief: StrategyBrief, actorUserId: string): Promise<void> {
    const record = {
      title: brief.title,
      payload: brief as unknown as object,
      provider: brief.provider,
      model: brief.model,
      generatedBy: actorUserId,
      generatedAt: new Date(brief.generatedAt),
    };

    await this.prisma.strategyBrief.upsert({
      where: { rootNodeId: brief.rootNodeId },
      update: record,
      create: { ...record, rootNodeId: brief.rootNodeId },
    });
  }
}
