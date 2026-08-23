-- Task 5: minimal Sync Logs scaffold.
-- Additive only: a new schema and a single new table. No existing schema,
-- table, or data is touched.

CREATE SCHEMA IF NOT EXISTS "integrations";

CREATE TYPE "integrations"."SyncRunStatus" AS ENUM ('success', 'failed', 'partial', 'running');

CREATE TABLE "integrations"."sync_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_key" TEXT NOT NULL,
  "source_name" TEXT NOT NULL,
  "status" "integrations"."SyncRunStatus" NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL,
  "completed_at" TIMESTAMPTZ,
  "records_processed" INTEGER,
  "records_created" INTEGER,
  "records_updated" INTEGER,
  "records_failed" INTEGER,
  "error_code" TEXT,
  "error_message" TEXT,
  "log_excerpt" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_runs_source_key_started_at_idx" ON "integrations"."sync_runs"("source_key", "started_at");
CREATE INDEX "sync_runs_status_started_at_idx" ON "integrations"."sync_runs"("status", "started_at");

-- Same app-role grant pattern as every other schema migration in this
-- project (see 20260816170000_add_value_management_core).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spm_app') THEN
    CREATE ROLE "spm_app" NOLOGIN;
  END IF;
  EXECUTE format('GRANT "spm_app" TO %I', current_user);
END
$$;
GRANT USAGE ON SCHEMA "integrations" TO "spm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "integrations" TO "spm_app";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "integrations" TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "integrations" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "spm_app";
ALTER DEFAULT PRIVILEGES IN SCHEMA "integrations" GRANT USAGE, SELECT ON SEQUENCES TO "spm_app";
