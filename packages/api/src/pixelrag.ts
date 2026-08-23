import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * PixelRAG service boundary.
 *
 * No procedure here writes to StratAlign business entities or Prisma. Smart
 * Import and Data Capture are proposal-only. The few operational mutations
 * (document lifecycle, alert acknowledgement, governance and ingestion
 * settings) update only the isolated PixelRAG service's POC state.
 */

const documentStatusSchema = z.enum(["uploaded", "processing", "ready", "failed"]);
const intelligenceKindSchema = z.enum([
  "variance_explanation",
  "executive_summary",
  "explain_kpi",
  "objective_health",
  "initiative_impact",
  "recommendations",
]);
const workflowStatusSchema = z.enum(["awaiting_review", "approved", "applied", "rejected"]);

const evidenceRefSchema = z.object({
  document_id: z.string().nullable(),
  document_name: z.string().nullable(),
  article_id: z.number().int().nonnegative().nullable(),
  tile_index: z.number().int().nonnegative().nullable(),
  chunk_index: z.number().int().nonnegative(),
  score: z.number().nullable(),
  page_hint: z.string().nullable(),
}).strict();

const objectiveSchema = z.object({
  name: z.string().nullable(),
  owner: z.string().nullable(),
  status: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(evidenceRefSchema),
}).strict();

const kpiSchema = z.object({
  name: z.string().nullable(),
  target: z.string().nullable(),
  actual: z.string().nullable(),
  status: z.string().nullable(),
  category: z.enum(["kpi", "financial", "risk", "operational", "people", "other"]),
  unit: z.string().nullable(),
  period: z.string().nullable(),
  aliases: z.array(z.string()),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(evidenceRefSchema),
}).strict();

const initiativeSchema = z.object({
  name: z.string().nullable(),
  owner: z.string().nullable(),
  status: z.string().nullable(),
  planned_completion: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(evidenceRefSchema),
}).strict();

const extractedDocumentSchema = z.object({
  reporting_period: z.string().nullable(),
  objectives: z.array(objectiveSchema),
  kpis: z.array(kpiSchema),
  initiatives: z.array(initiativeSchema),
  extracted_at: z.string().nullable(),
  source_document_id: z.string().nullable(),
  source_document_name: z.string().nullable(),
  extraction_version: z.string(),
}).strict();

const proposedObjectiveSchema = objectiveSchema.extend({
  action: z.enum(["create", "skip"]),
  reason: z.string().nullable(),
  selected: z.boolean(),
  edited: z.boolean(),
}).strict();

const proposedKpiSchema = kpiSchema.extend({
  action: z.enum(["create", "skip"]),
  reason: z.string().nullable(),
  selected: z.boolean(),
  edited: z.boolean(),
}).strict();

const proposedInitiativeSchema = initiativeSchema.extend({
  action: z.enum(["create", "skip"]),
  reason: z.string().nullable(),
  selected: z.boolean(),
  edited: z.boolean(),
}).strict();

const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: documentStatusSchema,
  uploaded_at: z.string(),
  page_count: z.number().int().nonnegative().nullable(),
  size_bytes: z.number().int().nonnegative(),
  error: z.string().nullable(),
  legacy: z.boolean(),
  original_type: z.string(),
  normalized_from: z.string().nullable(),
}).strict();

const healthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
}).strict();

const librarySchema = z.object({
  selected_document_id: z.string().nullable(),
  documents: z.array(documentSchema),
}).strict();

const qaSchema = z.object({
  document_id: z.string(),
  answer: z.string(),
  evidence: z.array(z.string()),
  tiles: z.array(z.object({
    score: z.number(),
    article_id: z.number().int().nonnegative(),
    tile_index: z.number().int().nonnegative(),
    chunk_index: z.number().int().nonnegative(),
    image_url: z.string(),
  }).strict()),
}).strict();

const multiQaSchema = z.object({
  answer: z.string(),
  evidence: z.array(z.string()),
  sources: z.array(z.object({
    document_id: z.string(),
    document_name: z.string(),
    answer: z.string(),
    evidence: z.array(z.string()),
  }).strict()),
}).strict();

const smartImportSchema = z.object({
  job_id: z.string().nullable(),
  document_id: z.string().nullable(),
  reporting_period: z.string().nullable(),
  objectives: z.array(proposedObjectiveSchema),
  kpis: z.array(proposedKpiSchema),
  initiatives: z.array(proposedInitiativeSchema),
  status: workflowStatusSchema,
  extraction_cached: z.boolean(),
}).strict();

const dataCaptureSchema = z.object({
  job_id: z.string().nullable(),
  document_id: z.string().nullable(),
  reporting_period: z.string().nullable(),
  updates: z.array(z.object({
    extracted_kpi: z.string().nullable(),
    matched_kpi: z.string().nullable(),
    current_actual: z.string().nullable(),
    proposed_actual: z.string().nullable(),
    period: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    match_score: z.number().min(0).max(1).nullable(),
    source_document_id: z.string().nullable(),
    source_document_name: z.string().nullable(),
    evidence: z.array(evidenceRefSchema),
    match_status: z.enum(["matched", "unmatched", "ambiguous", "missing_actual", "low_confidence"]),
    matched_index: z.number().int().nullable(),
    selected: z.boolean(),
  }).strict()),
  status: workflowStatusSchema,
  extraction_cached: z.boolean(),
}).strict();

const intelligenceSchema = z.object({
  kind: z.string(),
  subject: z.string().nullable(),
  answer: z.string(),
  evidence: z.array(z.string()),
  document_id: z.string().nullable(),
}).strict();

const forecastSchema = z.object({
  kpi_name: z.string(),
  unit: z.string().nullable(),
  history: z.array(z.object({ period: z.string(), actual: z.number() }).strict()),
  forecast_period: z.string(),
  forecast_value: z.number().nullable(),
  method: z.string(),
  note: z.string().nullable(),
}).strict();

const measurementSchema = z.object({
  id: z.string(),
  kpi_name: z.string(),
  period: z.string(),
  actual: z.string(),
  source_document_id: z.string().nullable(),
  source_document_name: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.array(evidenceRefSchema),
  recorded_at: z.string(),
}).strict();

const lineageSchema = z.object({
  kpi_name: z.string(),
  measurements: z.array(measurementSchema),
}).strict();

const alertSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  kind: z.string(),
  title: z.string(),
  message: z.string(),
  kpi_name: z.string().nullable(),
  document_id: z.string().nullable(),
  created_at: z.string(),
  acknowledged: z.boolean(),
}).strict();

const governanceSchema = z.object({
  require_human_approval: z.boolean(),
  minimum_extraction_confidence: z.number().min(0).max(1),
  minimum_match_confidence: z.number().min(0).max(1),
  allow_automatic_writes: z.boolean(),
  retain_evidence: z.boolean(),
  retain_audit_history: z.boolean(),
  allowed_apply_roles: z.array(z.string()),
  max_multi_document_sources: z.number().int().min(1).max(10),
}).strict();

const auditSchema = z.object({
  id: z.string(),
  at: z.string(),
  actor: z.string(),
  role: z.string(),
  action: z.string(),
  resource: z.string(),
  resource_id: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()),
}).strict();

const workflowSchema = z.object({
  id: z.string(),
  kind: z.enum(["smart_import", "data_capture"]),
  document_id: z.string(),
  document_name: z.string(),
  status: workflowStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  actor: z.string(),
  role: z.string(),
  extraction_version: z.string(),
  proposal: z.record(z.string(), z.unknown()),
}).strict();

const ingestionSettingsSchema = z.object({
  enabled: z.boolean(),
  poll_seconds: z.number().int().min(60).max(86400),
  watched_folder: z.string(),
}).strict();

const ingestionScanSchema = z.object({
  results: z.array(z.object({
    name: z.string().optional(),
    status: z.string(),
    reason: z.string().optional(),
    document_id: z.string().optional(),
    original_name: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }).strict()),
  supported_types: z.array(z.string()),
}).strict();

const connectorSchema = z.object({ id: z.string(), name: z.string(), status: z.string() }).strict();
const connectorCatalogSchema = z.object({
  active: z.array(connectorSchema),
  adapter_ready: z.array(connectorSchema),
  note: z.string(),
}).strict();

const evidenceImageSchema = z.object({
  mediaType: z.string(),
  dataBase64: z.string(),
}).strict();

export interface PixelRagServiceContract {
  health(): Promise<z.infer<typeof healthSchema>>;
  listDocuments(): Promise<z.infer<typeof librarySchema>>;
  uploadDocument(input: { filename: string; contentType?: string; dataBase64: string; actor?: string; role?: string }): Promise<z.infer<typeof documentSchema>>;
  selectDocument(documentId: string): Promise<z.infer<typeof documentSchema>>;
  reindexDocument(documentId: string): Promise<z.infer<typeof documentSchema>>;
  reanalyzeDocument(documentId: string): Promise<z.infer<typeof reanalysisSchema>>;
  ask(input: { question: string; topK?: number; role?: string }): Promise<z.infer<typeof qaSchema>>;
  askAcrossDocuments(input: { question: string; documentIds: string[]; topKPerDocument?: number }): Promise<z.infer<typeof multiQaSchema>>;
  evidenceImage(input: { documentId: string; articleId: number; tileIndex: number; chunkIndex: number }): Promise<z.infer<typeof evidenceImageSchema>>;
  previewSmartImport(input?: { actor?: string; role?: string }): Promise<z.infer<typeof smartImportSchema>>;
  previewDataCapture(input?: { actor?: string; role?: string }): Promise<z.infer<typeof dataCaptureSchema>>;
  intelligence(input: { kind: z.infer<typeof intelligenceKindSchema>; subject?: string; role?: string }): Promise<z.infer<typeof intelligenceSchema>>;
  forecast(kpiName: string): Promise<z.infer<typeof forecastSchema>>;
  lineage(kpiName: string): Promise<z.infer<typeof lineageSchema>>;
  alerts(): Promise<z.infer<typeof alertSchema>[]>;
  acknowledgeAlert(alertId: string): Promise<z.infer<typeof alertSchema>>;
  governance(): Promise<z.infer<typeof governanceSchema>>;
  updateGovernance(settings: z.infer<typeof governanceSchema>, role?: string): Promise<z.infer<typeof governanceSchema>>;
  audit(limit?: number): Promise<z.infer<typeof auditSchema>[]>;
  workflows(limit?: number): Promise<z.infer<typeof workflowSchema>[]>;
  ingestionSettings(): Promise<z.infer<typeof ingestionSettingsSchema>>;
  updateIngestionSettings(settings: z.infer<typeof ingestionSettingsSchema>): Promise<z.infer<typeof ingestionSettingsSchema>>;
  scanIngestion(): Promise<z.infer<typeof ingestionScanSchema>>;
  connectors(): Promise<z.infer<typeof connectorCatalogSchema>>;
}

const reanalysisSchema = z.object({ cached: z.boolean(), extraction: extractedDocumentSchema }).strict();

declare module "./index" {
  interface TrpcContext {
    pixelrag?: PixelRagServiceContract;
  }
}

function service(ctx: { pixelrag?: PixelRagServiceContract }): PixelRagServiceContract {
  if (!ctx.pixelrag) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Document intelligence is unavailable" });
  }
  return ctx.pixelrag;
}

function toPixelRagError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  const status = typeof error === "object" && error !== null && "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : null;
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Document intelligence is unavailable right now";

  if (status === 400 || status === 422) return new TRPCError({ code: "BAD_REQUEST", message });
  if (status === 401) return new TRPCError({ code: "UNAUTHORIZED", message });
  if (status === 403) return new TRPCError({ code: "FORBIDDEN", message });
  if (status === 404) return new TRPCError({ code: "NOT_FOUND", message });
  if (status === 409) return new TRPCError({ code: "CONFLICT", message });
  return new TRPCError({ code: "SERVICE_UNAVAILABLE", message });
}

const documentIdInput = z.string().trim().min(1).max(200);
const kpiNameInput = z.string().trim().min(1).max(300);

export const pixelRagRouter = router({
  health: protectedProcedure.output(healthSchema).query(async ({ ctx }) => {
    try { return await service(ctx).health(); } catch (error) { throw toPixelRagError(error); }
  }),

  documents: protectedProcedure.output(librarySchema).query(async ({ ctx }) => {
    try { return await service(ctx).listDocuments(); } catch (error) { throw toPixelRagError(error); }
  }),

  uploadDocument: protectedProcedure
    .input(z.object({
      filename: z.string().trim().min(1).max(255),
      contentType: z.string().trim().max(200).optional(),
      dataBase64: z.string().min(1).max(75_000_000),
    }).strict())
    .output(documentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).uploadDocument({ ...input, actor: ctx.session.user.id });
      } catch (error) { throw toPixelRagError(error); }
    }),

  selectDocument: protectedProcedure
    .input(z.object({ documentId: documentIdInput }).strict())
    .output(documentSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).selectDocument(input.documentId); } catch (error) { throw toPixelRagError(error); }
    }),

  reindexDocument: protectedProcedure
    .input(z.object({ documentId: documentIdInput }).strict())
    .output(documentSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).reindexDocument(input.documentId); } catch (error) { throw toPixelRagError(error); }
    }),

  reanalyzeDocument: protectedProcedure
    .input(z.object({ documentId: documentIdInput }).strict())
    .output(reanalysisSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).reanalyzeDocument(input.documentId); } catch (error) { throw toPixelRagError(error); }
    }),

  ask: protectedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(1000),
      topK: z.number().int().min(1).max(5).default(3),
    }).strict())
    .output(qaSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).ask({ question: input.question, topK: input.topK }); } catch (error) { throw toPixelRagError(error); }
    }),

  compare: protectedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(1000),
      documentIds: z.array(documentIdInput).min(1).max(3),
      topKPerDocument: z.number().int().min(1).max(5).default(3),
    }).strict())
    .output(multiQaSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).askAcrossDocuments(input); } catch (error) { throw toPixelRagError(error); }
    }),

  evidenceImage: protectedProcedure
    .input(z.object({
      documentId: documentIdInput,
      articleId: z.number().int().nonnegative(),
      tileIndex: z.number().int().nonnegative(),
      chunkIndex: z.number().int().nonnegative(),
    }).strict())
    .output(evidenceImageSchema)
    .query(async ({ ctx, input }) => {
      try { return await service(ctx).evidenceImage(input); } catch (error) { throw toPixelRagError(error); }
    }),

  previewSmartImport: protectedProcedure.output(smartImportSchema).mutation(async ({ ctx }) => {
    try { return await service(ctx).previewSmartImport({ actor: ctx.session.user.id }); } catch (error) { throw toPixelRagError(error); }
  }),

  previewDataCapture: protectedProcedure.output(dataCaptureSchema).mutation(async ({ ctx }) => {
    try { return await service(ctx).previewDataCapture({ actor: ctx.session.user.id }); } catch (error) { throw toPixelRagError(error); }
  }),

  intelligence: protectedProcedure
    .input(z.object({
      kind: intelligenceKindSchema,
      subject: z.string().trim().min(1).max(500).optional(),
    }).strict())
    .output(intelligenceSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).intelligence(input); } catch (error) { throw toPixelRagError(error); }
    }),

  forecast: protectedProcedure
    .input(z.object({ kpiName: kpiNameInput }).strict())
    .output(forecastSchema)
    .query(async ({ ctx, input }) => {
      try { return await service(ctx).forecast(input.kpiName); } catch (error) { throw toPixelRagError(error); }
    }),

  lineage: protectedProcedure
    .input(z.object({ kpiName: kpiNameInput }).strict())
    .output(lineageSchema)
    .query(async ({ ctx, input }) => {
      try { return await service(ctx).lineage(input.kpiName); } catch (error) { throw toPixelRagError(error); }
    }),

  alerts: protectedProcedure.output(z.array(alertSchema)).query(async ({ ctx }) => {
    try { return await service(ctx).alerts(); } catch (error) { throw toPixelRagError(error); }
  }),

  acknowledgeAlert: protectedProcedure
    .input(z.object({ alertId: z.string().trim().min(1).max(200) }).strict())
    .output(alertSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).acknowledgeAlert(input.alertId); } catch (error) { throw toPixelRagError(error); }
    }),

  governance: protectedProcedure.output(governanceSchema).query(async ({ ctx }) => {
    try { return await service(ctx).governance(); } catch (error) { throw toPixelRagError(error); }
  }),

  updateGovernance: protectedProcedure
    .input(governanceSchema)
    .output(governanceSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).updateGovernance(input, "admin"); } catch (error) { throw toPixelRagError(error); }
    }),

  audit: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict().optional())
    .output(z.array(auditSchema))
    .query(async ({ ctx, input }) => {
      try { return await service(ctx).audit(input?.limit ?? 100); } catch (error) { throw toPixelRagError(error); }
    }),

  workflows: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict().optional())
    .output(z.array(workflowSchema))
    .query(async ({ ctx, input }) => {
      try { return await service(ctx).workflows(input?.limit ?? 100); } catch (error) { throw toPixelRagError(error); }
    }),

  ingestionSettings: protectedProcedure.output(ingestionSettingsSchema).query(async ({ ctx }) => {
    try { return await service(ctx).ingestionSettings(); } catch (error) { throw toPixelRagError(error); }
  }),

  updateIngestionSettings: protectedProcedure
    .input(ingestionSettingsSchema)
    .output(ingestionSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      try { return await service(ctx).updateIngestionSettings(input); } catch (error) { throw toPixelRagError(error); }
    }),

  scanIngestion: protectedProcedure.output(ingestionScanSchema).mutation(async ({ ctx }) => {
    try { return await service(ctx).scanIngestion(); } catch (error) { throw toPixelRagError(error); }
  }),

  connectors: protectedProcedure.output(connectorCatalogSchema).query(async ({ ctx }) => {
    try { return await service(ctx).connectors(); } catch (error) { throw toPixelRagError(error); }
  }),
});
