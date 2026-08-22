import { describe, expect, it } from "vitest";
import type {
  QualityFlag,
  ReconciliationResult,
  RemediationItem,
} from "./index";

describe("integration domain schemas", () => {
  it("represents reconciliation, quality, and remediation records", () => {
    const reconciliation: ReconciliationResult = {
      id: "reconciliation-1",
      runId: "run-1",
      controlType: "row_count",
      sourceValue: "2",
      platformValue: "2",
      delta: 0,
      passed: true,
      checkedAt: new Date("2026-08-18T00:00:00Z"),
      detail: null,
    };
    const qualityFlag: QualityFlag = {
      id: "quality-1",
      subjectType: "source",
      subjectRef: "manual-template",
      rule: "reconciliation",
      severity: "error",
      detail: "Row count mismatch",
      state: "open",
      raisedByRunId: reconciliation.runId,
    };
    const remediation: RemediationItem = {
      id: "remediation-1",
      qualityFlagId: qualityFlag.id,
      description: "Correct and upload the template again",
      assignedTo: "salam-bi-data-contact",
      dueDate: new Date("2026-08-19T00:00:00Z"),
      state: "open",
    };

    expect(reconciliation.passed).toBe(true);
    expect(qualityFlag.raisedByRunId).toBe(reconciliation.runId);
    expect(remediation.qualityFlagId).toBe(qualityFlag.id);
  });
});
