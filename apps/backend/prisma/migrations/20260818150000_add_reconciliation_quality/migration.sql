CREATE TABLE "integration"."reconciliation_results" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "run_id" UUID NOT NULL,
  "control_type" TEXT NOT NULL CHECK ("control_type" IN ('row_count','sum_by_dimension','checksum')),
  "source_value" TEXT NOT NULL, "platform_value" TEXT NOT NULL,
  "delta" NUMERIC(30,10) NOT NULL, "passed" BOOLEAN NOT NULL,
  "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "detail" TEXT
);
CREATE INDEX "reconciliation_results_run_id_idx" ON "integration"."reconciliation_results"("run_id");
CREATE TABLE "integration"."quality_flags" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "subject_type" TEXT NOT NULL CHECK ("subject_type" IN ('kpi','feed','source')),
  "subject_ref" TEXT NOT NULL, "rule" TEXT NOT NULL CHECK ("rule" IN ('completeness','plausibility','freshness','reconciliation')),
  "severity" TEXT NOT NULL, "detail" TEXT NOT NULL, "state" TEXT NOT NULL CHECK ("state" IN ('open','remediating','closed')),
  "raised_by_run_id" UUID NOT NULL, "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "quality_flags_raised_by_run_id_idx" ON "integration"."quality_flags"("raised_by_run_id");
CREATE TABLE "integration"."remediation_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "quality_flag_id" UUID NOT NULL REFERENCES "integration"."quality_flags"("id") ON DELETE CASCADE,
  "description" TEXT NOT NULL, "assigned_to" TEXT NOT NULL, "due_date" TIMESTAMPTZ NOT NULL,
  "state" TEXT NOT NULL CHECK ("state" IN ('open','remediating','closed')), "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "remediation_items_assigned_to_state_idx" ON "integration"."remediation_items"("assigned_to", "state");
