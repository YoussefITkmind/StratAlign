import { z } from "zod";

/**
 * The contract the model's Strategy Brief output must satisfy.
 *
 * Deliberately narrow. The model is *not* asked for themes, objectives,
 * owners, progress figures, or counts — those are copied from the snapshot by
 * `StrategyBriefService`, so there is no path by which a model could invent
 * one. What remains here is the narrative it is actually good at: a summary,
 * a set of expected outcomes, and a prioritised reading of risk signals it was
 * handed.
 *
 * Anything that does not match is rejected outright rather than repaired —
 * a half-understood brief is worse than an honest failure.
 */

export const MAX_SUMMARY_LENGTH = 2_000;
export const MAX_OUTCOMES = 8;
export const MAX_OUTCOME_LENGTH = 300;
export const MAX_RISKS = 8;
export const MAX_RISK_TITLE_LENGTH = 200;
export const MAX_MITIGATION_LENGTH = 500;
export const MAX_AREA_LENGTH = 200;

const summaryText = z.string().trim().min(1).max(MAX_SUMMARY_LENGTH);

export const briefRiskSchema = z
  .object({
    severity: z.enum(["low", "medium", "high"]),
    /**
     * Free text here, checked against the snapshot's real theme names by the
     * service. Validating the *shape* and validating the *grounding* are
     * different jobs, and doing the second one here would make a single
     * mis-typed area name fail the entire brief.
     */
    area: z.string().trim().max(MAX_AREA_LENGTH).nullish(),
    title: z.string().trim().min(1).max(MAX_RISK_TITLE_LENGTH),
    mitigation: z.string().trim().min(1).max(MAX_MITIGATION_LENGTH),
  })
  .strict();

export const strategyBriefNarrativeSchema = z
  .object({
    executiveSummary: summaryText,
    /**
     * Used only when the strategy carries no vision of its own. When it does,
     * the stored vision is the source of truth and this field is discarded —
     * the model is never allowed to overwrite an authored vision.
     */
    visionSummary: z.string().trim().max(MAX_SUMMARY_LENGTH).nullish(),
    expectedOutcomes: z
      .array(z.string().trim().min(1).max(MAX_OUTCOME_LENGTH))
      .max(MAX_OUTCOMES),
    risks: z.array(briefRiskSchema).max(MAX_RISKS),
    /** The model's own signal that it could not brief the supplied data. */
    insufficientData: z.boolean(),
    insufficientDataReason: z.string().trim().max(MAX_SUMMARY_LENGTH).nullish(),
  })
  .strict();

export type LlmStrategyBriefNarrative = z.infer<typeof strategyBriefNarrativeSchema>;

/**
 * The shape a persisted brief payload must still have when it is read back.
 *
 * A stored brief outlives the deploy that wrote it, so the JSON column is
 * treated as untrusted on the way in just as the model's answer is. A payload
 * that no longer matches is reported as "no brief yet" rather than rendered
 * half-populated — the user is one click from regenerating a correct one.
 */
const briefSectionSchema = z
  .object({
    content: z.string().nullable(),
    source: z.enum(["ai", "user", "strategy", "none"]),
    aiContent: z.string().nullable(),
  })
  .strict();

export const storedStrategyBriefSchema = z
  .object({
    rootNodeId: z.string(),
    title: z.string(),
    generatedAt: z.string(),
    executiveSummary: briefSectionSchema,
    strategicVision: briefSectionSchema,
    strategicThemes: z.array(
      z
        .object({ id: z.string(), name: z.string(), objectiveCount: z.number().int().min(0) })
        .strict(),
    ),
    strategicObjectives: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          themeId: z.string().nullable(),
          themeName: z.string().nullable(),
          owner: z.string().nullable(),
          progress: z.number().nullable(),
          health: z.enum(["on-track", "at-risk", "off-track", "not-started"]),
        })
        .strict(),
    ),
    expectedOutcomes: z.array(z.string()),
    risks: z.array(
      z
        .object({
          severity: z.enum(["low", "medium", "high"]),
          area: z.string().nullable(),
          title: z.string(),
          mitigation: z.string(),
        })
        .strict(),
    ),
    insufficientData: z.boolean(),
    insufficientDataReason: z.string().nullable(),
    provider: z.string(),
    model: z.string(),
  })
  .strict();

/** Bounds a user's manual edit to a brief section. */
export const briefSectionEditSchema = z
  .object({
    section: z.enum(["executiveSummary", "strategicVision"]),
    /** `null` reverts the section to the AI-generated text. */
    content: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH).nullable(),
  })
  .strict();

export type BriefSectionEdit = z.infer<typeof briefSectionEditSchema>;
