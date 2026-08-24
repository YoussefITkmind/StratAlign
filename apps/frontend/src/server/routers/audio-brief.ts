import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the Executive Audio Brief.
 *
 * Same shape as `assistant.ts` and `ai-suggestion.ts`: this layer
 * authenticates and forwards. The report data, the significance selection,
 * the OpenAI script generation, and the OpenAI text-to-speech call all
 * happen in the backend — nothing here holds an API key, and nothing here
 * sends report data to the backend for it to forward, because the backend
 * retrieves that data itself.
 */

const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const audioBriefRouter = router({
  generate: authenticatedProcedure.input(z.object({}).strict()).mutation(({ ctx }) =>
    forward(() => backend(ctx).audioBrief.generate.mutate({}))),
});
