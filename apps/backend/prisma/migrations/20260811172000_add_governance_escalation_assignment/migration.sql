BEGIN;

ALTER TABLE "governance"."approval_cases"
  ADD COLUMN "approval_participant_id" TEXT,
  ADD COLUMN "approval_sla_ms" INTEGER NOT NULL DEFAULT 86400000;

ALTER TABLE "governance"."approval_cases"
  ADD CONSTRAINT "approval_cases_approval_sla_ms_check"
  CHECK ("approval_sla_ms" > 0);

ALTER TABLE "governance"."approval_cases"
  ADD CONSTRAINT "approval_cases_approval_participant_id_fkey"
  FOREIGN KEY ("approval_participant_id")
  REFERENCES "iam"."users"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "approval_cases_approval_participant_id_current_state_idx"
  ON "governance"."approval_cases"
    ("approval_participant_id", "current_state");

CREATE UNIQUE INDEX "escalation_cases_case_id_participant_deadline_key"
  ON "governance"."escalation_cases"
    ("case_id", "participant", "deadline");

COMMIT;
