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
const kpiName = z.string().trim().min(1).max(300);
const intelligenceKind = z.enum([
  "variance_explanation",
  "executive_summary",
  "explain_kpi",
  "objective_health",
  "initiative_impact",
  "recommendations",
]);

const governanceInput = z.object({
  require_human_approval: z.boolean(),
  minimum_extraction_confidence: z.number().min(0).max(1),
  minimum_match_confidence: z.number().min(0).max(1),
  allow_automatic_writes: z.boolean(),
  retain_evidence: z.boolean(),
  retain_audit_history: z.boolean(),
  allowed_apply_roles: z.array(z.string()),
  max_multi_document_sources: z.number().int().min(1).max(10),
}).strict();

const ingestionSettingsInput = z.object({
  enabled: z.boolean(),
  poll_seconds: z.number().int().min(60).max(86400),
  watched_folder: z.string().trim().min(1).max(500),
}).strict();

/** Browser-facing authenticated proxy for isolated PixelRAG capabilities. */
export const pixelRagRouter = router({
  health: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.health.query()),
  ),

  documents: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.documents.query()),
  ),

  uploadDocument: authenticatedProcedure
    .input(z.object({
      filename: z.string().trim().min(1).max(255),
      contentType: z.string().trim().max(200).optional(),
      dataBase64: z.string().min(1).max(75_000_000),
    }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.uploadDocument.mutate(input)),
    ),

  selectDocument: authenticatedProcedure
    .input(z.object({ documentId }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.selectDocument.mutate(input)),
    ),

  removeDocument: authenticatedProcedure
    .input(z.object({ documentId }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelragDocuments.removeDocument.mutate(input)),
    ),

  reindexDocument: authenticatedProcedure
    .input(z.object({ documentId }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.reindexDocument.mutate(input)),
    ),

  reanalyzeDocument: authenticatedProcedure
    .input(z.object({ documentId }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.reanalyzeDocument.mutate(input)),
    ),

  ask: authenticatedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(1000),
      topK: z.number().int().min(1).max(5).default(3),
    }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.ask.mutate(input)),
    ),

  compare: authenticatedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(1000),
      documentIds: z.array(documentId).min(2).max(3),
      topKPerDocument: z.number().int().min(1).max(5).default(3),
    }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelragVisual.compare.mutate(input)),
    ),

  evidenceImage: authenticatedProcedure
    .input(z.object({
      documentId,
      articleId: z.number().int().nonnegative(),
      tileIndex: z.number().int().nonnegative(),
      chunkIndex: z.number().int().nonnegative(),
    }).strict())
    .query(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.evidenceImage.query(input)),
    ),

  previewSmartImport: authenticatedProcedure.mutation(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.previewSmartImport.mutate()),
  ),

  previewDataCapture: authenticatedProcedure.mutation(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.previewDataCapture.mutate()),
  ),

  intelligence: authenticatedProcedure
    .input(z.object({
      kind: intelligenceKind,
      subject: z.string().trim().min(1).max(500).optional(),
    }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.intelligence.mutate(input)),
    ),

  forecast: authenticatedProcedure
    .input(z.object({ kpiName }).strict())
    .query(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.forecast.query(input)),
    ),

  lineage: authenticatedProcedure
    .input(z.object({ kpiName }).strict())
    .query(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.lineage.query(input)),
    ),

  alerts: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.alerts.query()),
  ),

  acknowledgeAlert: authenticatedProcedure
    .input(z.object({ alertId: z.string().trim().min(1).max(200) }).strict())
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.acknowledgeAlert.mutate(input)),
    ),

  governance: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.governance.query()),
  ),

  updateGovernance: authenticatedProcedure
    .input(governanceInput)
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.updateGovernance.mutate(input)),
    ),

  audit: authenticatedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict().optional())
    .query(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.audit.query(input)),
    ),

  workflows: authenticatedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict().optional())
    .query(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.workflows.query(input)),
    ),

  ingestionSettings: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.ingestionSettings.query()),
  ),

  updateIngestionSettings: authenticatedProcedure
    .input(ingestionSettingsInput)
    .mutation(({ ctx, input }) =>
      forward(() => backend(ctx).pixelrag.updateIngestionSettings.mutate(input)),
    ),

  scanIngestion: authenticatedProcedure.mutation(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.scanIngestion.mutate()),
  ),

  connectors: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).pixelrag.connectors.query()),
  ),
});
