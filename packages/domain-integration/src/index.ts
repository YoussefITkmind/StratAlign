export interface LineageRecord {
  id: string;
  figureRef: string;
  sourceSystem: string;
  sourceObject: string;
  sourceField: string;
  extractionTs: Date;
  transformationId: string;
  runId: string;
  checksum: string;
  createdAt: Date;
}

export interface ReconciliationResult { id: string; runId: string; controlType: "row_count" | "sum_by_dimension" | "checksum"; sourceValue: string; platformValue: string; delta: number; passed: boolean; checkedAt: Date; detail: string | null }
export interface QualityFlag { id: string; subjectType: "kpi" | "feed" | "source"; subjectRef: string; rule: "completeness" | "plausibility" | "freshness" | "reconciliation"; severity: string; detail: string; state: "open" | "remediating" | "closed"; raisedByRunId: string }
export interface RemediationItem { id: string; qualityFlagId: string; description: string; assignedTo: string; dueDate: Date; state: "open" | "remediating" | "closed" }
