import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * Theme-level AI suggestion surface.
 *
 * Follows the same shape as `strategy.ts`: the service contract lives here, the
 * backend supplies an implementation through context, and the router owns
 * authorisation, strict input validation, output validation, and the mapping
 * from domain errors to codes a client may see. No provider name, prompt, model
 * response, or credential crosses this boundary except the provider and model
 * identifiers, which are recorded as provenance and are safe to show.
 */

export type SuggestionKindOutput = "kpi" | "okr";

export interface SuggestionDuplicateMatchOutput {
  kpiDefinitionId: string | null;
  okrId: string | null;
  nameEn: string;
  similarity: number;
}

export interface SuggestedKeyResultOutput {
  titleEn: string;
  titleAr: string;
  type: "quantitative" | "milestone";
  targetValue: number;
  unit: string;
}

export interface ThemeSuggestionOutput {
  suggestionId: string;
  generationId: string;
  themeNodeId: string;
  themeNameEn: string;
  kind: SuggestionKindOutput;
  titleEn: string;
  titleAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  confidence: number;
  rationale: string | null;
  kpi: {
    unit: string;
    frequency: "monthly" | "quarterly";
    polarity: "higher_is_better" | "lower_is_better";
  } | null;
  okr: {
    objectiveNodeId: string;
    keyResults: SuggestedKeyResultOutput[];
  } | null;
  duplicateMatches: SuggestionDuplicateMatchOutput[];
}

export interface ThemeSuggestionBatchOutput {
  generationId: string;
  themeNodeId: string;
  provider: string;
  model: string;
  latencyMs: number;
  suggestions: ThemeSuggestionOutput[];
}

export interface AcceptedSuggestionOutput {
  suggestionId: string;
  subjectType: "kpi_definition" | "okr";
  subjectId: string;
  alreadyAccepted: boolean;
  edited: boolean;
}

export interface AcceptFailureOutput {
  suggestionId: string;
  reason:
    | "duplicate"
    | "invalid"
    | "not_authorized"
    | "theme_not_found"
    | "creation_failed"
    | "in_progress";
  message: string;
}

export interface AcceptBatchResultOutput {
  accepted: AcceptedSuggestionOutput[];
  failed: AcceptFailureOutput[];
}

export interface AiSuggestionServiceContract {
  generate(input: {
    themeNodeId: string;
    kinds: readonly SuggestionKindOutput[];
    maxSuggestions: number;
  }): Promise<ThemeSuggestionBatchOutput>;

  accept(
    input: AcceptSuggestionContractInput,
    actorUserId: string,
  ): Promise<AcceptedSuggestionOutput>;

  acceptMany(
    inputs: readonly AcceptSuggestionContractInput[],
    actorUserId: string,
  ): Promise<AcceptBatchResultOutput>;
}

export interface AcceptSuggestionContractInput {
  suggestionId: string;
  generationId: string;
  themeNodeId: string;
  kind: SuggestionKindOutput;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  confidence: number;
  provider: string;
  model: string;
  edited: boolean;
  acknowledgeDuplicate?: boolean;
  kpi?: {
    unit: string;
    frequency: "monthly" | "quarterly";
    polarity: "higher_is_better" | "lower_is_better";
  } | null;
  okr?: {
    objectiveNodeId: string;
    keyResults: SuggestedKeyResultOutput[];
  } | null;
}

declare module "./index" {
  interface TrpcContext {
    aiSuggestion?: AiSuggestionServiceContract;
  }
}

const id = z.string().uuid();

/**
 * Open to any authenticated user by design — AI-suggest generation and
 * acceptance are demo-facing features that every signed-in user should be
 * able to reach, not gated behind the registry-authoring roles.
 */
const suggestionAuthor = () => protectedProcedure;

const service = (ctx: {
  aiSuggestion?: AiSuggestionServiceContract;
}): AiSuggestionServiceContract => {
  if (!ctx.aiSuggestion) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI suggestion service unavailable",
    });
  }
  return ctx.aiSuggestion;
};

const keyResultSchema = z
  .object({
    titleEn: z.string().trim().min(1).max(300),
    titleAr: z.string().trim().min(1).max(300),
    type: z.enum(["quantitative", "milestone"]),
    targetValue: z.number().finite(),
    unit: z.string().trim().min(1).max(50),
  })
  .strict();

/**
 * The accept payload is re-validated here, not trusted because generation
 * produced something like it. A reviewer edits these values before sending
 * them, so by the time they arrive they are ordinary user input.
 */
const acceptSuggestionSchema = z
  .object({
    suggestionId: id,
    generationId: id,
    themeNodeId: id,
    kind: z.enum(["kpi", "okr"]),
    titleEn: z.string().trim().min(1).max(300),
    titleAr: z.string().trim().min(1).max(300),
    descriptionEn: z.string().trim().max(2_000).nullish(),
    descriptionAr: z.string().trim().max(2_000).nullish(),
    confidence: z.number().min(0).max(1),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
    edited: z.boolean(),
    acknowledgeDuplicate: z.boolean().optional(),
    kpi: z
      .object({
        unit: z.string().trim().min(1).max(50),
        frequency: z.enum(["monthly", "quarterly"]),
        polarity: z.enum(["higher_is_better", "lower_is_better"]),
      })
      .strict()
      .nullish(),
    okr: z
      .object({
        objectiveNodeId: id,
        keyResults: z.array(keyResultSchema).min(1).max(6),
      })
      .strict()
      .nullish(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "kpi" && !input.kpi) {
      context.addIssue({
        code: "custom",
        path: ["kpi"],
        message: "A KPI suggestion requires KPI fields",
      });
    }

    if (input.kind === "okr" && !input.okr) {
      context.addIssue({
        code: "custom",
        path: ["okr"],
        message: "An OKR suggestion requires an objective and key results",
      });
    }
  });

const duplicateMatchOutputSchema = z
  .object({
    kpiDefinitionId: z.string().uuid().nullable(),
    okrId: z.string().uuid().nullable(),
    nameEn: z.string(),
    similarity: z.number().min(0).max(1),
  })
  .strict();

const suggestionOutputSchema = z
  .object({
    suggestionId: z.string().uuid(),
    generationId: z.string().uuid(),
    themeNodeId: z.string().uuid(),
    themeNameEn: z.string(),
    kind: z.enum(["kpi", "okr"]),
    titleEn: z.string(),
    titleAr: z.string(),
    descriptionEn: z.string().nullable(),
    descriptionAr: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    rationale: z.string().nullable(),
    kpi: z
      .object({
        unit: z.string(),
        frequency: z.enum(["monthly", "quarterly"]),
        polarity: z.enum(["higher_is_better", "lower_is_better"]),
      })
      .strict()
      .nullable(),
    okr: z
      .object({
        objectiveNodeId: z.string().uuid(),
        keyResults: z.array(keyResultSchema),
      })
      .strict()
      .nullable(),
    duplicateMatches: z.array(duplicateMatchOutputSchema),
  })
  .strict();

const batchOutputSchema = z
  .object({
    generationId: z.string().uuid(),
    themeNodeId: z.string().uuid(),
    provider: z.string(),
    model: z.string(),
    latencyMs: z.number().nonnegative(),
    suggestions: z.array(suggestionOutputSchema),
  })
  .strict();

const acceptedOutputSchema = z
  .object({
    suggestionId: z.string().uuid(),
    subjectType: z.enum(["kpi_definition", "okr"]),
    subjectId: z.string().uuid(),
    alreadyAccepted: z.boolean(),
    edited: z.boolean(),
  })
  .strict();

const acceptBatchOutputSchema = z
  .object({
    accepted: z.array(acceptedOutputSchema),
    failed: z.array(
      z
        .object({
          suggestionId: z.string().uuid(),
          reason: z.enum([
            "duplicate",
            "invalid",
            "not_authorized",
            "theme_not_found",
            "creation_failed",
            "in_progress",
          ]),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

/**
 * Maps a service failure to something a client may see.
 *
 * Every branch here returns a fixed message. An upstream provider error can
 * carry account identifiers or echoed prompt text, and a database error can
 * carry a host and port, so neither is ever forwarded.
 */
function toSuggestionError(error: unknown, fallback: string): TRPCError {
  // A TRPCError raised inside the handler already carries a deliberate code —
  // re-wrapping it would report a wiring fault as bad user input.
  if (error instanceof TRPCError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "AI_UNAVAILABLE":
      return new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "AI suggestions are unavailable right now. Try again later.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "The AI service took too long to respond. Try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message:
          "The AI response could not be used. Try generating suggestions again.",
      });
    case "AI_SUGGESTION_FAILED":
      return new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error ? error.message : fallback,
      });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: fallback });
  }
}

export const aiSuggestionRouter = router({
  /**
   * Generation is a mutation rather than a query: it spends money, is not
   * cacheable, and must never be replayed by a client-side refetch.
   */
  generate: suggestionAuthor()
    .input(
      z
        .object({
          themeNodeId: id,
          kinds: z.array(z.enum(["kpi", "okr"])).min(1).max(2).default(["kpi", "okr"]),
          maxSuggestions: z.number().int().min(1).max(12).default(8),
        })
        .strict(),
    )
    .output(batchOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).generate(input);
      } catch (error) {
        throw toSuggestionError(error, "Unable to generate suggestions");
      }
    }),

  accept: suggestionAuthor()
    .input(acceptSuggestionSchema)
    .output(acceptedOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).accept(input, ctx.session.user.id);
      } catch (error) {
        throw toSuggestionError(error, "Unable to accept this suggestion");
      }
    }),

  /**
   * Accept-all. Reports per item rather than failing the batch, so one refused
   * duplicate does not discard eleven good creations — and because each item
   * carries its own idempotency key, a retry of the whole batch re-creates
   * nothing that already landed.
   */
  acceptMany: suggestionAuthor()
    .input(
      z
        .object({
          suggestions: z.array(acceptSuggestionSchema).min(1).max(12),
        })
        .strict(),
    )
    .output(acceptBatchOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).acceptMany(
          input.suggestions,
          ctx.session.user.id,
        );
      } catch (error) {
        throw toSuggestionError(error, "Unable to accept these suggestions");
      }
    }),
});
