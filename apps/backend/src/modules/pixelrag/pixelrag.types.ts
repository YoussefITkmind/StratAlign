/**
 * Contracts used by the StratAlign backend when communicating with the
 * separately deployed PixelRAG document-intelligence service.
 *
 * These types deliberately mirror the Python service's JSON wire format.
 * PixelRAG remains isolated from StratAlign's persistence and business logic.
 */

export type PixelRagDocumentStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed";

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

export type PixelRagKpiCategory =
  | "kpi"
  | "financial"
  | "risk"
  | "operational"
  | "people"
  | "other";

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
  match_status:
    | "matched"
    | "unmatched"
    | "ambiguous"
    | "missing_actual"
    | "low_confidence";
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
