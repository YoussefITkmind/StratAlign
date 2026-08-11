// Matches the API contract's MeasurementSourceValue (lowercase)
// The service converts to Prisma enum (MANUAL/FEED/TEMPLATE) before DB writes.
export type MeasurementSource = "manual" | "feed" | "template";

export interface CreateMeasurementInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSource;
  locked?: boolean;
  supersedesId?: string | null;
  submittedBy?: string | null;
  evidenceRef?: string | null;
}

export interface MeasurementView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSource;
  locked: boolean;
  supersedesId: string | null;
  submittedBy: string | null;
  evidenceRef: string | null;
  createdAt: Date;
}

export interface MeasurementListOptions {
  kpiVersionId?: string;
  scopeNodeId?: string;
  period?: string;
  asOf?: Date; // Point-in-time resolution
  includeSuperseded?: boolean;
}

export interface CreateTargetSeriesInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  targetValue: number;
  planVersionId?: string | null;
}

export interface TargetSeriesView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  targetValue: number;
  planVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentaryInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  authorId: string;
  bodyEn?: string | null;
  bodyAr?: string | null;
}

export interface CommentaryView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  authorId: string;
  bodyEn: string | null;
  bodyAr: string | null;
  createdAt: Date;
}

export interface StatusResultView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  status: string;
  computedAt: Date;
  ruleVersionUsed: string;
  createdAt: Date;
}

export interface RollupResultView {
  id: string;
  parentKpiId: string;
  scopeNodeId: string;
  period: string;
  aggregatedValue: number;
  method: string;
  createdAt: Date;
}

export type CaptureSessionState = "draft" | "submitted" | "recalled";

export interface CaptureSessionView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  state: CaptureSessionState;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartCaptureSessionInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  ownerId: string;
}

export interface SubmitCaptureSessionInput {
  sessionId: string;
  measurementValue: number;
  evidenceRef?: string | null;
}

export interface RecallCaptureSessionInput {
  sessionId: string;
}
