import { z } from "zod";

import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";
import { authenticatedProcedure, router } from "@/server/trpc";

const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);

const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    return translateBackendRegistryError(error);
  }
};

const documentId = z.string().trim().min(1).max(200);

const intelligenceKind = z.enum([
  "variance_explanation",
  "executive_summary",
  "explain_kpi",
  "objective_health",
  "initiative_impact",
  "recommendations",
]);

/**
 * Browser-facing proxy for PixelRAG document intelligence.
 *
 * This router contains no direct database access and no apply/write endpoint.
 * Smart Import and Data Capture remain proposal/preview operations only.
 */
export const pixelRagRouter = router({
  health: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.health.query()),
  ),

  documents: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.documents.query()),
  ),

  selectDocument: authenticatedProcedure
    .input(
      z
        .object({
          documentId,
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.selectDocument.mutate(input)),
    ),

  ask: authenticatedProcedure
    .input(
      z
        .object({
          question: z.string().trim().min(1).max(1000),
          topK: z.number().int().min(1).max(5).default(3),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.ask.mutate(input)),
    ),

  compare: authenticatedProcedure
    .input(
      z
        .object({
          question: z.string().trim().min(1).max(1000),
          documentIds: z.array(documentId).min(1).max(3),
          topKPerDocument: z.number().int().min(1).max(5).default(3),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.compare.mutate(input)),
    ),

  previewSmartImport: authenticatedProcedure.mutation(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.previewSmartImport.mutate()),
  ),

  previewDataCapture: authenticatedProcedure.mutation(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.previewDataCapture.mutate()),
  ),

  intelligence: authenticatedProcedure
    .input(
      z
        .object({
          kind: intelligenceKind,
          subject: z.string().trim().min(1).max(500).optional(),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.intelligence.mutate(input)),
    ),
});
