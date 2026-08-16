-- Phase 5.2 Value Gates & Check-in Scheduling Refinement

-- Gate reviews are created from execution stage-transition events. Keep the
-- transition identity so at-least-once event delivery cannot create duplicates.
ALTER TABLE "value"."gate_reviews"
  ADD COLUMN "from_stage" TEXT,
  ADD COLUMN "approval_case_id" UUID,
  ADD COLUMN "transition_dedupe_key" TEXT;

ALTER TABLE "value"."gate_reviews"
  ADD CONSTRAINT "gate_reviews_from_stage_check"
    CHECK ("from_stage" IS NULL OR "from_stage" IN ('design','pilot','execute','scale','done')),
  ADD CONSTRAINT "gate_reviews_approval_case_id_fkey"
    FOREIGN KEY ("approval_case_id") REFERENCES "governance"."approval_cases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "gate_reviews_approval_case_id_key" UNIQUE ("approval_case_id"),
  ADD CONSTRAINT "gate_reviews_transition_dedupe_key_key" UNIQUE ("transition_dedupe_key");

CREATE INDEX "gate_reviews_pending_stage_idx"
  ON "value"."gate_reviews"("initiative_id", "stage", "created_at")
  WHERE "decision" IS NULL;

-- Evidence is deliberately reference-based. Documents remain in their owning
-- document store, and KPI/Benefit/commentary records remain in their domains.
CREATE TYPE "value"."GateEvidenceKind" AS ENUM ('document', 'kpi', 'benefit', 'commentary');

CREATE TABLE "value"."gate_review_evidence" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gate_review_id" UUID NOT NULL,
  "kind" "value"."GateEvidenceKind" NOT NULL,
  "reference" TEXT NOT NULL,
  "label" TEXT,
  "attached_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gate_review_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gate_review_evidence_gate_review_id_fkey"
    FOREIGN KEY ("gate_review_id") REFERENCES "value"."gate_reviews"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "gate_review_evidence_attached_by_fkey"
    FOREIGN KEY ("attached_by") REFERENCES "iam"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_review_evidence_reference_nonempty" CHECK (length(btrim("reference")) > 0)
);
CREATE INDEX "gate_review_evidence_review_idx"
  ON "value"."gate_review_evidence"("gate_review_id", "created_at");

-- An intervene decision does not silently mutate unrelated Phase-2 KPI
-- commentary. Instead it creates the same explicit human-commentary obligation
-- pattern, linked to the initiative and gate review, for downstream UI/workflow.
CREATE TABLE "value"."gate_corrective_action_requirements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "gate_review_id" UUID NOT NULL,
  "initiative_id" UUID NOT NULL,
  "required_by" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "commentary_ref" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "gate_corrective_action_requirements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gate_corrective_action_requirements_gate_review_id_key" UNIQUE ("gate_review_id"),
  CONSTRAINT "gate_corrective_action_requirements_gate_review_id_fkey"
    FOREIGN KEY ("gate_review_id") REFERENCES "value"."gate_reviews"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_corrective_action_requirements_initiative_id_fkey"
    FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_corrective_action_requirements_required_by_fkey"
    FOREIGN KEY ("required_by") REFERENCES "iam"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_corrective_action_requirements_status_check"
    CHECK ("status" IN ('open','resolved')),
  CONSTRAINT "gate_corrective_action_requirements_resolution_check" CHECK (
    ("status" = 'open' AND "resolved_at" IS NULL)
    OR ("status" = 'resolved' AND "resolved_at" IS NOT NULL AND "commentary_ref" IS NOT NULL)
  )
);
CREATE INDEX "gate_corrective_action_requirements_initiative_idx"
  ON "value"."gate_corrective_action_requirements"("initiative_id", "status");

-- Phase 5.1 made evaluation evidence immutable immediately. Phase 5.2 creates
-- a pending gate first, then evaluates it explicitly. Permit exactly one
-- pending -> evaluated snapshot write; every later edit remains forbidden.
CREATE OR REPLACE FUNCTION "value"."prevent_gate_snapshot_change"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_status TEXT := COALESCE(OLD."criteria_eval_snapshot"->>'status', 'evaluated');
  new_status TEXT := COALESCE(NEW."criteria_eval_snapshot"->>'status', 'evaluated');
BEGIN
  IF NEW."criteria_eval_snapshot" IS DISTINCT FROM OLD."criteria_eval_snapshot" THEN
    IF NOT (old_status = 'pending' AND new_status = 'evaluated' AND OLD."decision" IS NULL) THEN
      RAISE EXCEPTION 'Gate review criteria snapshot is immutable after evaluation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Structural anti-auto-advance guardrail. No ordinary SQL path can populate or
-- alter a human gate decision. The ValueService decision workflow opens this
-- transaction-local capability only around its guarded human decision write.
CREATE OR REPLACE FUNCTION "value"."enforce_human_gate_decision"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."decision" IS DISTINCT FROM OLD."decision"
     OR NEW."decided_by" IS DISTINCT FROM OLD."decided_by"
     OR NEW."decided_at" IS DISTINCT FROM OLD."decided_at" THEN
    IF COALESCE(current_setting('spm.gate_decision_authorized', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'Gate decisions are human-only and must use the guarded decision workflow' USING ERRCODE = '42501';
    END IF;
    IF NEW."decision" IS NULL OR NEW."decided_by" IS NULL OR NEW."decided_at" IS NULL THEN
      RAISE EXCEPTION 'Gate decision requires decision, decidedBy and decidedAt' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "gate_reviews_human_decision_only"
BEFORE UPDATE ON "value"."gate_reviews"
FOR EACH ROW EXECUTE FUNCTION "value"."enforce_human_gate_decision"();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "value"."gate_review_evidence" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "value"."gate_corrective_action_requirements" TO "spm_app";
