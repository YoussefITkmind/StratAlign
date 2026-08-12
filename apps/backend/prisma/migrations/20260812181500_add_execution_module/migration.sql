CREATE SCHEMA IF NOT EXISTS "execution";

CREATE TYPE "execution"."initiative_stage" AS ENUM ('design', 'pilot', 'execute', 'scale', 'done');
CREATE TYPE "execution"."milestone_health" AS ENUM ('on_time', 'at_risk', 'late');
CREATE TYPE "execution"."execution_source" AS ENUM ('manual', 'jira', 'erp');
CREATE TYPE "execution"."initiative_status" AS ENUM ('on_track', 'at_risk', 'off_track');
CREATE TYPE "execution"."confidence_level" AS ENUM ('high', 'medium', 'low');
CREATE TYPE "execution"."risk_level" AS ENUM ('low', 'medium', 'high');

CREATE TABLE "execution"."initiatives" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "strategic_play_node_id" UUID NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "stage" "execution"."initiative_stage" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "initiatives_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution"."jira_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "jira_project_key" TEXT NOT NULL,
  "jira_project_url" TEXT NOT NULL,
  "last_synced_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jira_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jira_links_initiative_key" UNIQUE ("initiative_id")
);

CREATE TABLE "execution"."milestone_flags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jira_link_id" UUID NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "due_date" DATE NOT NULL,
  "forecast_date" DATE,
  "health" "execution"."milestone_health" NOT NULL,
  "source" "execution"."execution_source" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "milestone_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "milestone_source_check" CHECK ("source" IN ('manual', 'jira'))
);

CREATE TABLE "execution"."status_updates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "period" TEXT NOT NULL,
  "stage" "execution"."initiative_stage" NOT NULL,
  "status" "execution"."initiative_status" NOT NULL,
  "confidence" "execution"."confidence_level" NOT NULL,
  "narrative_en" TEXT,
  "narrative_ar" TEXT,
  "submitted_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "status_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "execution"."financial_attrs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "budget_amount" NUMERIC(20, 6) NOT NULL,
  "spend_amount" NUMERIC(20, 6) NOT NULL,
  "currency" TEXT NOT NULL,
  "source" "execution"."execution_source" NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_attrs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_attrs_initiative_key" UNIQUE ("initiative_id")
);

CREATE TABLE "execution"."risk_indicators" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "initiative_id" UUID NOT NULL,
  "level" "execution"."risk_level" NOT NULL,
  "source" "execution"."execution_source" NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "risk_indicators_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "risk_indicators_initiative_key" UNIQUE ("initiative_id")
);

CREATE INDEX "initiatives_play_idx" ON "execution"."initiatives"("strategic_play_node_id");
CREATE INDEX "initiatives_owner_idx" ON "execution"."initiatives"("owner_user_id");
CREATE INDEX "status_updates_history_idx" ON "execution"."status_updates"("initiative_id", "period" DESC, "created_at" DESC);
CREATE INDEX "milestone_flags_jira_link_idx" ON "execution"."milestone_flags"("jira_link_id");

ALTER TABLE "execution"."initiatives" ADD CONSTRAINT "initiatives_play_fkey" FOREIGN KEY ("strategic_play_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."initiatives" ADD CONSTRAINT "initiatives_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."jira_links" ADD CONSTRAINT "jira_links_initiative_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execution"."milestone_flags" ADD CONSTRAINT "milestone_flags_jira_link_fkey" FOREIGN KEY ("jira_link_id") REFERENCES "execution"."jira_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execution"."status_updates" ADD CONSTRAINT "status_updates_initiative_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."status_updates" ADD CONSTRAINT "status_updates_submitter_fkey" FOREIGN KEY ("submitted_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "execution"."financial_attrs" ADD CONSTRAINT "financial_attrs_initiative_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execution"."risk_indicators" ADD CONSTRAINT "risk_indicators_initiative_fkey" FOREIGN KEY ("initiative_id") REFERENCES "execution"."initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ADR-06 deliberately keeps Execution as a thin linkage/status layer. Detailed
-- PM concepts such as task lists, resource assignments, dependencies and Gantt
-- scheduling do not belong in this schema; Jira remains the system of record.

CREATE OR REPLACE FUNCTION "execution"."reject_status_update_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'execution.status_updates is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "status_updates_no_update"
BEFORE UPDATE ON "execution"."status_updates"
FOR EACH ROW EXECUTE FUNCTION "execution"."reject_status_update_mutation"();

CREATE TRIGGER "status_updates_no_delete"
BEFORE DELETE ON "execution"."status_updates"
FOR EACH ROW EXECUTE FUNCTION "execution"."reject_status_update_mutation"();
