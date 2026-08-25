import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, requireRole, router } from "./index";

/**
 * AI-generated executive Strategy Brief for the Strategy Hierarchy.
 *
 * Same shape as `assistant.ts` and `ai-suggestion.ts`: the service contract
 * lives here, the backend supplies an implementation through context, and this
 * file owns authorisation, strict input validation, output validation, and the
 * mapping from domain errors to codes a client may see.
 *
 * Authorisation mirrors the rest of `strategyHierarchy`: reading the brief is
 * open to any authenticated user, while generating one (which spends money and
 * writes a row) and editing one are gated on `seo_administrator`, exactly as
 * `strategyHierarchy.draftDescription` already is.
 */

const MAX_SECTION_LENGTH = 2_000;

const briefSectionOutputSchema = z
  .object({
    content: z.string().nullable(),
    source: z.enum(["ai", "user", "strategy", "none"]),
    aiContent: z.string().nullable(),
  })
  .strict();

const briefThemeOutputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    objectiveCount: z.number().int().min(0),
  })
  .strict();

const briefObjectiveOutputSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    themeId: z.string().nullable(),
    themeName: z.string().nullable(),
    owner: z.string().nullable(),
    progress: z.number().nullable(),
    health: z.enum(["on-track", "at-risk", "off-track", "not-started"]),
  })
  .strict();

const briefRiskOutputSchema = z
  .object({
    severity: z.enum(["low", "medium", "high"]),
    area: z.string().nullable(),
    title: z.string(),
    mitigation: z.string(),
  })
  .strict();

const strategyBriefOutputSchema = z
  .object({
    rootNodeId: z.string(),
    title: z.string(),
    generatedAt: z.string(),
    executiveSummary: briefSectionOutputSchema,
    strategicVision: briefSectionOutputSchema,
    strategicThemes: z.array(briefThemeOutputSchema),
    strategicObjectives: z.array(briefObjectiveOutputSchema),
    expectedOutcomes: z.array(z.string()),
    risks: z.array(briefRiskOutputSchema),
    insufficientData: z.boolean(),
    insufficientDataReason: z.string().nullable(),
    provider: z.string(),
    model: z.string(),
  })
  .strict();

export type StrategyBriefOutput = z.infer<typeof strategyBriefOutputSchema>;

const strategyRefSchema = z
  .object({ rootNodeId: z.string().uuid().optional() })
  .strict();

const updateSectionInputSchema = z
  .object({
    rootNodeId: z.string().uuid().optional(),
    section: z.enum(["executiveSummary", "strategicVision"]),
    /** `null` reverts the section to the AI-generated text. */
    content: z.string().trim().min(1).max(MAX_SECTION_LENGTH).nullable(),
  })
  .strict();

export type UpdateBriefSectionInput = z.infer<typeof updateSectionInputSchema>;

export interface StrategyBriefServiceContract {
  get(rootNodeId?: string): Promise<StrategyBriefOutput | null>;
  generate(input: {
    rootNodeId?: string;
    actorUserId: string;
  }): Promise<StrategyBriefOutput>;
  updateSection(input: {
    rootNodeId?: string;
    edit: { section: "executiveSummary" | "strategicVision"; content: string | null };
  }): Promise<StrategyBriefOutput>;
}

declare module "./index" {
  interface TrpcContext {
    strategyBrief?: StrategyBriefServiceContract;
  }
}

function service(ctx: {
  strategyBrief?: StrategyBriefServiceContract;
}): StrategyBriefServiceContract {
  if (!ctx.strategyBrief) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Strategy brief service unavailable",
    });
  }
  return ctx.strategyBrief;
}

/**
 * Maps a service failure to something a client may see. Every branch returns a
 * fixed message — an upstream provider error can carry account identifiers or
 * echoed prompt text, so none of that is ever forwarded.
 */
function toBriefError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "AI_STRATEGY_NOT_FOUND":
      return new TRPCError({
        code: "NOT_FOUND",
        message: "That strategy could not be found.",
      });
    case "AI_BRIEF_NOT_FOUND":
      return new TRPCError({
        code: "NOT_FOUND",
        message: "Generate the strategy brief before editing it.",
      });
    case "AI_UNAVAILABLE":
      return new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "The AI service is unavailable right now. Try again later.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "Generating the strategy brief took too long. Try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "We couldn't generate the strategy brief. Please try again.",
      });
    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "We couldn't generate the strategy brief. Please try again.",
      });
  }
}

const admin = () => requireRole("seo_administrator");

export const strategyBriefRouter = router({
  /** The last generated brief, or null when there is none yet. */
  get: protectedProcedure
    .input(strategyRefSchema.optional())
    .output(strategyBriefOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        return await service(ctx).get(input?.rootNodeId);
      } catch (error) {
        throw toBriefError(error);
      }
    }),

  /**
   * A mutation, not a query: it spends money, writes a row, and must never be
   * replayed by a client-side refetch. Regeneration is the same call — it
   * always re-collects the hierarchy rather than reusing an old snapshot.
   */
  generate: admin()
    .input(strategyRefSchema.optional())
    .output(strategyBriefOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).generate({
          rootNodeId: input?.rootNodeId,
          actorUserId: ctx.session.user.id,
        });
      } catch (error) {
        throw toBriefError(error);
      }
    }),

  updateSection: admin()
    .input(updateSectionInputSchema)
    .output(strategyBriefOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).updateSection({
          rootNodeId: input.rootNodeId,
          edit: { section: input.section, content: input.content },
        });
      } catch (error) {
        throw toBriefError(error);
      }
    }),
});
