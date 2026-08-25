import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the AI Executive Audio Brief.
 *
 * Same shape as `assistant.ts`: this layer authenticates, revalidates input,
 * and forwards. Data gathering, significance selection, the model call, and
 * speech synthesis all happen in the backend — nothing here holds an API key
 * or decides what is significant.
 */

const generateInput = z
  .object({
    /** Reserved for role-personalised briefs; ignored by the backend in v1. */
    role: z.string().trim().min(1).max(60).optional(),
  })
  .strict()
  .default({});

const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const audioBriefRouter = router({
  generate: authenticatedProcedure.input(generateInput).mutation(({ ctx, input }) =>
    forward(() => backend(ctx).audioBrief.generate.mutate(input))),
});
