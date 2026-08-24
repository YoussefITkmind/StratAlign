import type {
  KeyResultTypeView,
  KpiFrequencyView,
  KpiPolarityView,
} from "../registry/registry.types";

/** A strategy node reduced to what the prompt and the review UI both need. */
export interface ThemeContextNode {
  id: string;
  nameEn: string;
  nameAr: string;
  type: string;
}

export interface ThemeContextKeyResult {
  type: KeyResultTypeView;
  targetValue: number;
  unit: string;
  titleEn: string | null;
}

export interface ThemeContextOkr {
  id: string;
  objectiveNodeId: string;
  nameEn: string;
  nameAr: string;
  keyResults: ThemeContextKeyResult[];
}

export interface ThemeContextKpi {
  kpiDefinitionId: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  unit: string;
  frequency: KpiFrequencyView;
  polarity: KpiPolarityView;
}

/**
 * Everything the model is told about one theme.
 *
 * Assembled server-side from the owning modules. Nothing here originates in the
 * browser, so a caller cannot widen the model's view by editing a request.
 */
export interface ThemeSuggestionContext {
  theme: ThemeContextNode;
  /** Root-first path down to (and excluding) the theme. */
  ancestry: ThemeContextNode[];
  /** Objective nodes beneath the theme — the only legal anchors for an OKR. */
  objectives: ThemeContextNode[];
  existingOkrs: ThemeContextOkr[];
  existingKpis: ThemeContextKpi[];
}

export type SuggestionKind = "kpi" | "okr";

export interface SuggestedKeyResult {
  titleEn: string;
  titleAr: string;
  type: KeyResultTypeView;
  targetValue: number;
  unit: string;
}

/** A possible collision with something the registry already holds. */
export interface SuggestionDuplicateMatch {
  kpiDefinitionId: string | null;
  okrId: string | null;
  nameEn: string;
  /** 0-1. For OKRs this is 1 on a normalised exact-name collision. */
  similarity: number;
}

export interface KpiSuggestionFields {
  unit: string;
  frequency: KpiFrequencyView;
  polarity: KpiPolarityView;
}

export interface OkrSuggestionFields {
  objectiveNodeId: string;
  keyResults: SuggestedKeyResult[];
}

/**
 * One reviewable proposal. Not persisted: it exists only between generation and
 * the user's accept or reject decision.
 */
export interface ThemeSuggestion {
  /** Server-minted idempotency key, echoed back on accept. */
  suggestionId: string;
  generationId: string;
  themeNodeId: string;
  themeNameEn: string;
  kind: SuggestionKind;
  titleEn: string;
  titleAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  /** 0-1 model self-estimate. Never a correctness guarantee. */
  confidence: number;
  rationale: string | null;
  kpi: KpiSuggestionFields | null;
  okr: OkrSuggestionFields | null;
  /** Non-empty when the candidate looks like something that already exists. */
  duplicateMatches: SuggestionDuplicateMatch[];
}

export interface ThemeSuggestionBatch {
  generationId: string;
  themeNodeId: string;
  provider: string;
  model: string;
  latencyMs: number;
  suggestions: ThemeSuggestion[];
}

export type AcceptedSubjectType = "kpi_definition" | "okr";

export interface AcceptedSuggestion {
  suggestionId: string;
  subjectType: AcceptedSubjectType;
  subjectId: string;
  /** True when this accept found existing provenance and created nothing. */
  alreadyAccepted: boolean;
  edited: boolean;
}

export interface AcceptFailure {
  suggestionId: string;
  /** Stable, non-leaking reason code the UI can branch on. */
  reason:
    | "duplicate"
    | "invalid"
    | "not_authorized"
    | "theme_not_found"
    | "creation_failed"
    /** A concurrent accept of the same proposal has not settled yet. */
    | "in_progress";
  message: string;
}

export interface AcceptBatchResult {
  accepted: AcceptedSuggestion[];
  failed: AcceptFailure[];
}
