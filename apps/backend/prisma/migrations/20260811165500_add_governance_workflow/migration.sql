BEGIN;

CREATE SCHEMA IF NOT EXISTS "governance";

CREATE TYPE "governance"."ApprovalCaseState" AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'changes_requested'
);

CREATE TYPE "governance"."ApprovalDecision" AS ENUM (
  'approved',
  'rejected'
);

CREATE TABLE "governance"."workflow_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workflow_key" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition_json" JSONB NOT NULL,
  "is_current" BOOLEAN NOT NULL DEFAULT true,
  "supersedes_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workflow_definitions_version_check" CHECK ("version" > 0),
  CONSTRAINT "workflow_definitions_key_check" CHECK (length(btrim("workflow_key")) > 0)
);

CREATE UNIQUE INDEX "workflow_definitions_workflow_key_version_key"
  ON "governance"."workflow_definitions"("workflow_key", "version");

CREATE UNIQUE INDEX "workflow_definitions_supersedes_id_key"
  ON "governance"."workflow_definitions"("supersedes_id");

CREATE INDEX "workflow_definitions_workflow_key_is_current_idx"
  ON "governance"."workflow_definitions"("workflow_key", "is_current");

CREATE TABLE "governance"."approval_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workflow_definition_id" UUID NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "submitted_by" TEXT NOT NULL,
  "current_state" "governance"."ApprovalCaseState" NOT NULL DEFAULT 'draft',
  "xstate_context_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "approval_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "approval_cases_entity_type_check" CHECK (length(btrim("entity_type")) > 0),
  CONSTRAINT "approval_cases_entity_id_check" CHECK (length(btrim("entity_id")) > 0)
);

CREATE INDEX "approval_cases_workflow_definition_id_idx"
  ON "governance"."approval_cases"("workflow_definition_id");

CREATE INDEX "approval_cases_entity_type_entity_id_idx"
  ON "governance"."approval_cases"("entity_type", "entity_id");

CREATE INDEX "approval_cases_submitted_by_idx"
  ON "governance"."approval_cases"("submitted_by");

CREATE INDEX "approval_cases_current_state_idx"
  ON "governance"."approval_cases"("current_state");

CREATE TABLE "governance"."escalation_cases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL,
  "participant" TEXT NOT NULL,
  "deadline" TIMESTAMP(3) NOT NULL,
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "escalation_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "escalation_cases_case_id_idx"
  ON "governance"."escalation_cases"("case_id");

CREATE INDEX "escalation_cases_participant_acknowledged_at_idx"
  ON "governance"."escalation_cases"("participant", "acknowledged_at");

CREATE INDEX "escalation_cases_deadline_acknowledged_at_idx"
  ON "governance"."escalation_cases"("deadline", "acknowledged_at");

CREATE TABLE "governance"."decision_log_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "case_id" UUID NOT NULL,
  "decision" "governance"."ApprovalDecision" NOT NULL,
  "decided_by" TEXT NOT NULL,
  "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rationale" TEXT,

  CONSTRAINT "decision_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decision_log_entries_case_id_key"
  ON "governance"."decision_log_entries"("case_id");

CREATE INDEX "decision_log_entries_decided_by_idx"
  ON "governance"."decision_log_entries"("decided_by");

CREATE INDEX "decision_log_entries_decided_at_idx"
  ON "governance"."decision_log_entries"("decided_at");

ALTER TABLE "governance"."workflow_definitions"
  ADD CONSTRAINT "workflow_definitions_supersedes_id_fkey"
  FOREIGN KEY ("supersedes_id")
  REFERENCES "governance"."workflow_definitions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "governance"."approval_cases"
  ADD CONSTRAINT "approval_cases_workflow_definition_id_fkey"
  FOREIGN KEY ("workflow_definition_id")
  REFERENCES "governance"."workflow_definitions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE,
  ADD CONSTRAINT "approval_cases_submitted_by_fkey"
  FOREIGN KEY ("submitted_by")
  REFERENCES "iam"."users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "governance"."escalation_cases"
  ADD CONSTRAINT "escalation_cases_case_id_fkey"
  FOREIGN KEY ("case_id")
  REFERENCES "governance"."approval_cases"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE,
  ADD CONSTRAINT "escalation_cases_participant_fkey"
  FOREIGN KEY ("participant")
  REFERENCES "iam"."users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE,
  ADD CONSTRAINT "escalation_cases_acknowledged_by_fkey"
  FOREIGN KEY ("acknowledged_by")
  REFERENCES "iam"."users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "governance"."decision_log_entries"
  ADD CONSTRAINT "decision_log_entries_case_id_fkey"
  FOREIGN KEY ("case_id")
  REFERENCES "governance"."approval_cases"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE,
  ADD CONSTRAINT "decision_log_entries_decided_by_fkey"
  FOREIGN KEY ("decided_by")
  REFERENCES "iam"."users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

COMMIT;
