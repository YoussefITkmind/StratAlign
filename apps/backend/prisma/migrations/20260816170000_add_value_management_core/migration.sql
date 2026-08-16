-- Phase 5.1 Value Management Core
-- The value taxonomy is data, not an enum, so administrators can extend it.

CREATE SCHEMA IF NOT EXISTS "value";

CREATE TYPE "value"."ValueLifecycleState" AS ENUM (
  'identification', 'pending_approval', 'approved', 'validation', 'tracking', 'closure'
);
CREATE TYPE "value"."ValueEntryState" AS ENUM ('planned', 'inflight', 'realized');
CREATE TYPE "value"."ValueEntrySource" AS ENUM ('manual', 'feed');
CREATE TYPE "value"."GateDecision" AS ENUM ('continue', 'intervene', 'stop');

CREATE TABLE "value"."value_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "value_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "value_categories_key_key" UNIQUE ("key")
);

CREATE TABLE "value"."benefits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "category_id" UUID NOT NULL,
  "driver" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "workflow_case_id" UUID,
  "lifecycle_state" "value"."ValueLifecycleState" NOT NULL DEFAULT 'identification',
  "workflow_snapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "benefits_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "benefits_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "value"."value_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "benefits_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "benefits_workflow_case_id_fkey" FOREIGN KEY ("workflow_case_id") REFERENCES "governance"."approval_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "benefits_initiative_id_idx" ON "value"."benefits"("initiative_id");
CREATE INDEX "benefits_owner_user_id_idx" ON "value"."benefits"("owner_user_id");
CREATE INDEX "benefits_workflow_case_id_idx" ON "value"."benefits"("workflow_case_id");

CREATE TABLE "value"."benefit_baselines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "benefit_id" UUID NOT NULL,
  "amount" NUMERIC(20,6) NOT NULL,
  "currency" TEXT NOT NULL,
  "approved_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefit_baselines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "benefit_baselines_benefit_id_key" UNIQUE ("benefit_id"),
  CONSTRAINT "benefit_baselines_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "value"."benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "benefit_baselines_currency_check" CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE TABLE "value"."benefit_feed_bindings" (
  "benefit_id" UUID NOT NULL,
  "binding_ref" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefit_feed_bindings_pkey" PRIMARY KEY ("benefit_id"),
  CONSTRAINT "benefit_feed_bindings_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "value"."benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "value"."value_state_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "benefit_id" UUID NOT NULL,
  "state" "value"."ValueEntryState" NOT NULL,
  "amount" NUMERIC(20,6) NOT NULL,
  "currency" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "source" "value"."ValueEntrySource" NOT NULL,
  "lineage_ref" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "value_state_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "value_state_entries_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "value"."benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "value_state_entries_currency_check" CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT "value_state_entries_period_check" CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX "value_state_entries_benefit_state_period_idx" ON "value"."value_state_entries"("benefit_id", "state", "period");

CREATE TABLE "value"."checkins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "benefit_id" UUID NOT NULL,
  "due_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "months_post_delivery" SMALLINT NOT NULL,
  "realized_amount_at_checkin" NUMERIC(20,6),
  "escalation_case_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkins_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkins_benefit_months_key" UNIQUE ("benefit_id", "months_post_delivery"),
  CONSTRAINT "checkins_benefit_id_fkey" FOREIGN KEY ("benefit_id") REFERENCES "value"."benefits"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "checkins_escalation_case_id_fkey" FOREIGN KEY ("escalation_case_id") REFERENCES "governance"."approval_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "checkins_months_check" CHECK ("months_post_delivery" IN (3,6,12))
);
CREATE INDEX "checkins_due_incomplete_idx" ON "value"."checkins"("due_at") WHERE "completed_at" IS NULL;

CREATE TABLE "value"."gate_reviews" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "stage" TEXT NOT NULL,
  "criteria_eval_snapshot" JSONB NOT NULL,
  "decision" "value"."GateDecision",
  "decided_by" TEXT,
  "decided_at" TIMESTAMPTZ,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gate_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gate_reviews_initiative_id_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_reviews_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_reviews_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "gate_reviews_stage_check" CHECK ("stage" IN ('design','pilot','execute','scale','done')),
  CONSTRAINT "gate_reviews_decision_fields_check" CHECK (
    ("decision" IS NULL AND "decided_by" IS NULL AND "decided_at" IS NULL)
    OR ("decision" IS NOT NULL AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL)
  )
);
CREATE INDEX "gate_reviews_initiative_stage_idx" ON "value"."gate_reviews"("initiative_id", "stage", "created_at");

INSERT INTO "value"."value_categories" ("key", "name_en", "name_ar") VALUES
  ('revenue_growth', 'Revenue growth', 'نمو الإيرادات'),
  ('cost_optimization', 'Cost optimization', 'تحسين التكلفة'),
  ('operational_efficiency', 'Operational efficiency', 'الكفاءة التشغيلية'),
  ('customer_impact', 'Customer impact', 'أثر العملاء'),
  ('strategic_enablement', 'Strategic enablement', 'التمكين الاستراتيجي'),
  ('risk_mitigation', 'Risk mitigation', 'الحد من المخاطر'),
  ('other', 'Other', 'أخرى')
ON CONFLICT ("key") DO NOTHING;

-- Feed-lock invariant: after a benefit is bound to a future system-of-record
-- feed, realized values cannot be manually supplied through any code path.
CREATE OR REPLACE FUNCTION "value"."enforce_realized_feed_lock"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."state" = 'realized'
     AND EXISTS (SELECT 1 FROM "value"."benefit_feed_bindings" b WHERE b."benefit_id" = NEW."benefit_id")
     AND NEW."source" <> 'feed' THEN
    RAISE EXCEPTION 'Realized values for feed-bound benefits must use source=feed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "value_state_entries_feed_lock"
BEFORE INSERT OR UPDATE ON "value"."value_state_entries"
FOR EACH ROW EXECUTE FUNCTION "value"."enforce_realized_feed_lock"();

-- Gate criteria are evidence captured at review creation time. The decision may
-- be updated later, but the rule-evaluation snapshot itself is write-once.
CREATE OR REPLACE FUNCTION "value"."prevent_gate_snapshot_change"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."criteria_eval_snapshot" IS DISTINCT FROM OLD."criteria_eval_snapshot" THEN
    RAISE EXCEPTION 'Gate review criteria snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "gate_reviews_snapshot_immutable"
BEFORE UPDATE ON "value"."gate_reviews"
FOR EACH ROW EXECUTE FUNCTION "value"."prevent_gate_snapshot_change"();

-- Match the Measurement permission-level immutability precedent. The app role
-- receives normal CRUD for the value schema except UPDATE/DELETE/TRUNCATE on
-- BenefitBaseline. The migration/owner role retains ownership for migrations.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spm_app') THEN
    CREATE ROLE "spm_app" NOLOGIN;
  END IF;
  EXECUTE format('GRANT "spm_app" TO %I', current_user);
END
$$;
GRANT USAGE ON SCHEMA "value" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "value" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "value" TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "value" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "value" GRANT USAGE, SELECT ON SEQUENCES TO "spm_app";
REVOKE ALL PRIVILEGES ON TABLE "value"."benefit_baselines" FROM "spm_app";
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "value"."benefit_baselines" FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE "value"."benefit_baselines" TO "spm_app";
