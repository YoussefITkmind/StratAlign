/**
 * Wire contracts for the independently deployed PixelRAG service.
 * PixelRAG remains isolated from StratAlign persistence and business services.
 */

export type PixelRagDocumentStatus = "uploaded" | "processing" | "ready" | "failed";

export interface PixelRagHealth {
  status: string;
  service: string;
  version: string;
}

export interface PixelRagDocumentRecord {
  id: string;
  name: string;
  status: PixelRagDocumentStatus;
  uploaded_at: string;
  page_count: number | null;
  size_bytes: number;
  error: string | null;
  legacy: boolean;
  original_type: string;
  normalized_from: string | null;
}

export interface PixelRagDocumentLibraryState {
  selected_document_id: string | null;
  documents: PixelRagDocumentRecord[];
}

export interface PixelRagEvidenceRef {
  document_id: string | null;
  document_name: string | null;
  article_id: number | null;
  tile_index: number | null;
  chunk_index: number;
  score: number | null;
  page_hint: string | null;
}

export interface PixelRagEvidenceTile {
  score: number;
  article_id: number;
  tile_index: number;
  chunk_index: number;
  image_url: string;
}

export interface PixelRagQaResult {
  document_id: string;
  answer: string;
  evidence: string[];
  tiles: PixelRagEvidenceTile[];
}

export interface PixelRagMultiDocumentSource {
  document_id: string;
  document_name: string;
  answer: string;
  evidence: string[];
}

export interface PixelRagMultiDocumentQaResult {
  answer: string;
  evidence: string[];
  sources: PixelRagMultiDocumentSource[];
}

export interface PixelRagObjective {
  name: string | null;
  owner: string | null;
  status: string | null;
  confidence: number | null;
  evidence: PixelRagEvidenceRef[];
}

export type PixelRagKpiCategory = "kpi" | "financial" | "risk" | "operational" | "people" | "other";

export interface PixelRagKpi {
  name: string | null;
  target: string | null;
  actual: string | null;
  status: string | null;
  category: PixelRagKpiCategory;
  unit: string | null;
  period: string | null;
  aliases: string[];
  confidence: number | null;
  evidence: PixelRagEvidenceRef[];
}

export interface PixelRagInitiative {
  name: string | null;
  owner: string | null;
  status: string | null;
  planned_completion: string | null;
  confidence: number | null;
  evidence: PixelRagEvidenceRef[];
}

export interface PixelRagExtractedDocument {
  reporting_period: string | null;
  objectives: PixelRagObjective[];
  kpis: PixelRagKpi[];
  initiatives: PixelRagInitiative[];
  extracted_at: string | null;
  source_document_id: string | null;
  source_document_name: string | null;
  extraction_version: string;
}

export interface PixelRagReanalysisResult {
  cached: boolean;
  extraction: PixelRagExtractedDocument;
}

export interface PixelRagProposedObjective extends PixelRagObjective {
  action: "create" | "skip";
  reason: string | null;
  selected: boolean;
  edited: boolean;
}

export interface PixelRagProposedKpi extends PixelRagKpi {
  action: "create" | "skip";
  reason: string | null;
  selected: boolean;
  edited: boolean;
}

export interface PixelRagProposedInitiative extends PixelRagInitiative {
  action: "create" | "skip";
  reason: string | null;
  selected: boolean;
  edited: boolean;
}

export interface PixelRagSmartImportProposal {
  job_id: string | null;
  document_id: string | null;
  reporting_period: string | null;
  objectives: PixelRagProposedObjective[];
  kpis: PixelRagProposedKpi[];
  initiatives: PixelRagProposedInitiative[];
  status: "awaiting_review" | "approved" | "applied" | "rejected";
  extraction_cached: boolean;
}

export interface PixelRagKpiUpdateMatch {
  extracted_kpi: string | null;
  matched_kpi: string | null;
  current_actual: string | null;
  proposed_actual: string | null;
  period: string | null;
  confidence: number | null;
  match_score: number | null;
  source_document_id: string | null;
  source_document_name: string | null;
  evidence: PixelRagEvidenceRef[];
  match_status: "matched" | "unmatched" | "ambiguous" | "missing_actual" | "low_confidence";
  matched_index: number | null;
  selected: boolean;
}

export interface PixelRagDataCaptureProposal {
  job_id: string | null;
  document_id: string | null;
  reporting_period: string | null;
  updates: PixelRagKpiUpdateMatch[];
  status: "awaiting_review" | "approved" | "applied" | "rejected";
  extraction_cached: boolean;
}

export type PixelRagIntelligenceKind =
  | "variance_explanation"
  | "executive_summary"
  | "explain_kpi"
  | "objective_health"
  | "initiative_impact"
  | "recommendations";

export interface PixelRagIntelligenceResult {
  kind: string;
  subject: string | null;
  answer: string;
  evidence: string[];
  document_id: string | null;
}

export interface PixelRagForecastPoint {
  period: string;
  actual: number;
}

export interface PixelRagForecastResult {
  kpi_name: string;
  unit: string | null;
  history: PixelRagForecastPoint[];
  forecast_period: string;
  forecast_value: number | null;
  method: string;
  note: string | null;
}

export interface PixelRagKpiMeasurement {
  id: string;
  kpi_name: string;
  period: string;
  actual: string;
  source_document_id: string | null;
  source_document_name: string | null;
  confidence: number | null;
  evidence: PixelRagEvidenceRef[];
  recorded_at: string;
}

export interface PixelRagLineageResult {
  kpi_name: string;
  measurements: PixelRagKpiMeasurement[];
}

export interface PixelRagAlert {
  id: string;
  severity: "info" | "warning" | "critical";
  kind: string;
  title: string;
  message: string;
  kpi_name: string | null;
  document_id: string | null;
  created_at: string;
  acknowledged: boolean;
}

export interface PixelRagGovernanceSettings {
  require_human_approval: boolean;
  minimum_extraction_confidence: number;
  minimum_match_confidence: number;
  allow_automatic_writes: boolean;
  retain_evidence: boolean;
  retain_audit_history: boolean;
  allowed_apply_roles: string[];
  max_multi_document_sources: number;
}

export interface PixelRagAuditEvent {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  resource: string;
  resource_id: string | null;
  detail: Record<string, unknown>;
}

export interface PixelRagWorkflowJob {
  id: string;
  kind: "smart_import" | "data_capture";
  document_id: string;
  document_name: string;
  status: "awaiting_review" | "approved" | "applied" | "rejected";
  created_at: string;
  updated_at: string;
  actor: string;
  role: string;
  extraction_version: string;
  proposal: Record<string, unknown>;
}

export interface PixelRagIngestionSettings {
  enabled: boolean;
  poll_seconds: number;
  watched_folder: string;
}

export interface PixelRagIngestionScanItem {
  name?: string;
  status: string;
  reason?: string;
  document_id?: string;
  original_name?: string;
  message?: string;
  error?: string;
}

export interface PixelRagIngestionScanResult {
  results: PixelRagIngestionScanItem[];
  supported_types: string[];
}

export interface PixelRagConnector {
  id: string;
  name: string;
  status: string;
}

export interface PixelRagConnectorCatalog {
  active: PixelRagConnector[];
  adapter_ready: PixelRagConnector[];
  note: string;
}

export interface PixelRagEvidenceImage {
  mediaType: string;
  dataBase64: string;
}
