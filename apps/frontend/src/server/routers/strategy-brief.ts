import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the AI Strategy Brief.
 *
 * Same shape as `assistant.ts` and `ai-suggestion.ts`: this layer
 * authenticates, revalidates input, and forwards. The model call, the data
 * collection, and every authorisation decision happen in the backend — nothing
 * here holds an API key, reads the database, or decides who may generate.
 */

const MAX_SECTION_LENGTH = 2_000;

const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const strategyRef = z.object({ rootNodeId: z.string().uuid().optional() }).strict();

const updateSectionInput = z
  .object({
    rootNodeId: z.string().uuid().optional(),
    section: z.enum(["executiveSummary", "strategicVision"]),
    /** `null` reverts the section to the AI-generated text. */
    content: z.string().trim().min(1).max(MAX_SECTION_LENGTH).nullable(),
  })
  .strict();

export const strategyBriefRouter = router({
  get: authenticatedProcedure
    .input(strategyRef.optional())
    .query(({ ctx, input }) => forward(() => backend(ctx).strategyBrief.get.query(input))),

  generate: authenticatedProcedure
    .input(strategyRef.optional())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).strategyBrief.generate.mutate(input))),

  updateSection: authenticatedProcedure
    .input(updateSectionInput)
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).strategyBrief.updateSection.mutate(input))),
});
