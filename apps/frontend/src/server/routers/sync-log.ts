import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the Sync Logs surface.
 *
 * Same shape as `ai-suggestion.ts`: this layer authenticates, revalidates
 * input, and forwards. Every read, the model call, and the investigation
 * result validation all happen in the backend — nothing here holds an API
 * key or an LLM credential.
 */

const id = z.string().uuid();
const statusSchema = z.enum(["success", "failed", "partial", "running"]);
const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    return translateBackendRegistryError(error);
  }
};

export const syncLogRouter = router({
  list: authenticatedProcedure
    .input(
      z
        .object({
          sourceKey: z.string().trim().min(1).max(200).optional(),
          status: statusSchema.optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict(),
    )
    .query(({ ctx, input }) => forward(() => backend(ctx).syncLog.list.query(input))),

  get: authenticatedProcedure
    .input(z.object({ syncRunId: id }).strict())
    .query(({ ctx, input }) => forward(() => backend(ctx).syncLog.get.query(input))),

  investigate: authenticatedProcedure
    .input(z.object({ syncRunId: id }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).syncLog.investigate.mutate(input))),
});
