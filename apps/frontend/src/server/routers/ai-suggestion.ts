import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the theme-level AI suggestion surface.
 *
 * Same shape as `registry.ts`: this layer authenticates, revalidates input, and
 * forwards. Authorisation, the model call, and every write happen in the
 * backend — nothing here holds an API key, and the browser never learns which
 * provider is configured beyond the identifier recorded as provenance.
 */

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const keyResultInput = z.object({
  titleEn: z.string().trim().min(1).max(300),
  titleAr: z.string().trim().min(1).max(300),
  type: z.enum(["quantitative", "milestone"]),
  targetValue: z.number().finite(),
  unit: z.string().trim().min(1).max(50),
}).strict();

const acceptInput = z.object({
  suggestionId: id,
  generationId: id,
  themeNodeId: id,
  kind: z.enum(["kpi", "okr"]),
  titleEn: z.string().trim().min(1).max(300),
  titleAr: z.string().trim().min(1).max(300),
  descriptionEn: z.string().trim().max(2000).nullish(),
  descriptionAr: z.string().trim().max(2000).nullish(),
  confidence: z.number().min(0).max(1),
  provider: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  edited: z.boolean(),
  acknowledgeDuplicate: z.boolean().optional(),
  kpi: z.object({
    unit: z.string().trim().min(1).max(50),
    frequency: z.enum(["monthly", "quarterly"]),
    polarity: z.enum(["higher_is_better", "lower_is_better"]),
  }).strict().nullish(),
  okr: z.object({
    objectiveNodeId: id,
    keyResults: z.array(keyResultInput).min(1).max(6),
  }).strict().nullish(),
}).strict();

export const aiSuggestionRouter = router({
  generate: authenticatedProcedure.input(z.object({
    themeNodeId: id,
    kinds: z.array(z.enum(["kpi", "okr"])).min(1).max(2),
    maxSuggestions: z.number().int().min(1).max(12),
  }).strict()).mutation(({ ctx, input }) =>
    forward(() => backend(ctx).aiSuggestion.generate.mutate(input))),

  accept: authenticatedProcedure.input(acceptInput)
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).aiSuggestion.accept.mutate(input))),

  acceptMany: authenticatedProcedure.input(z.object({
    suggestions: z.array(acceptInput).min(1).max(12),
  }).strict()).mutation(({ ctx, input }) =>
    forward(() => backend(ctx).aiSuggestion.acceptMany.mutate(input))),
});
