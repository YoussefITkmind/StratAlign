/**
 * View models returned by registry services.
 *
 * Enum-valued fields are exposed in the lowercase wire form used across the
 * platform (see `RuleDefinitionView`), so the Prisma enum casing never leaks
 * past the service boundary.
 */

export type KpiStatusView = "draft" | "active" | "retired";
export type KpiPolarityView = "higher_is_better" | "lower_is_better";
export type KpiFrequencyView = "monthly" | "quarterly";
export type KpiDataSourceTypeView = "manual" | "feed";
export type KeyResultTypeView = "quantitative" | "milestone";
export type AlignmentTypeView =
  | "objective"
  | "play"
  | "sector"
  | "project"
  | "theme";

export interface KpiVersionView {
  id: string;
  kpiDefinitionId: string;
  version: number;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  unit: string;
  polarity: KpiPolarityView;
  frequency: KpiFrequencyView;
  dataSourceType: KpiDataSourceTypeView;
  calculationLogicText: string | null;
  ownerUserId: string;
  stewardUserId: string | null;
  activeFrom: Date;
  supersedesVersionId: string | null;
  approvalCaseId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface KpiDefinitionView {
  id: string;
  activeVersionId: string | null;
  status: KpiStatusView;
  retiredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface KpiWithVersionView {
  definition: KpiDefinitionView;
  version: KpiVersionView;
}

export interface KpiThresholdRuleBindingView {
  id: string;
  kpiVersionId: string;
  thresholdRuleId: string;
  ruleKey: string;
  ruleVersion: number;
  createdAt: Date;
  createdBy: string;
  supersedesBindingId: string | null;
}

/** Which column produced a trigram hit, and how strongly. */
export interface SimilarityMatchField {
  field: "nameEn" | "nameAr" | "descriptionEn" | "descriptionAr";
  score: number;
}

export interface KpiSimilarityMatch {
  kpiDefinitionId: string;
  kpiVersionId: string;
  version: number;
  status: KpiStatusView;
  nameEn: string;
  nameAr: string;
  /** Highest score across all searched columns. */
  similarity: number;
  /** 1-based position in the result set, strongest first. */
  rank: number;
  matchingFields: SimilarityMatchField[];
}

export interface AlignmentView {
  id: string;
  kpiDefinitionId: string;
  strategyNodeId: string;
  alignmentType: AlignmentTypeView;
  createdAt: Date;
}

export interface RetirementImpactView {
  kpiDefinitionId: string;
  status: KpiStatusView;
  /** Alignments that would be left dangling by retirement. */
  affectedAlignments: AlignmentView[];
  /** Distinct strategy node ids reachable through those alignments. */
  affectedStrategyNodeIds: string[];
  /** Hierarchy edges where this KPI is the parent or the child. */
  affectedHierarchyEdges: KpiHierarchyEdgeView[];
  /** Whether the configured Strategy adapter can verify referenced nodes. */
  strategyNodesVerified: boolean;
}

export interface KpiHierarchyEdgeView {
  id: string;
  parentKpiId: string;
  childKpiId: string;
  rollupMethodRuleId: string;
  createdAt: Date;
}

export interface OkrView {
  id: string;
  objectiveNodeId: string;
  nameEn: string;
  nameAr: string;
  createdAt: Date;
  updatedAt: Date;
  keyResults: KeyResultView[];
}

export interface KeyResultView {
  id: string;
  okrId: string;
  type: KeyResultTypeView;
  titleEn: string | null;
  titleAr: string | null;
  targetValue: number;
  unit: string;
  currentValue: number | null;
  progressPercent: number | null;
  progressUpdatedAt: Date | null;
}
