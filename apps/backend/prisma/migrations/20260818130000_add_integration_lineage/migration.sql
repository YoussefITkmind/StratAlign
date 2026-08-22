CREATE SCHEMA IF NOT EXISTS "integration";

CREATE TABLE "integration"."lineage_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "figure_ref" TEXT NOT NULL,
  "source_system" TEXT NOT NULL,
  "source_object" TEXT NOT NULL,
  "source_field" TEXT NOT NULL,
  "extraction_ts" TIMESTAMPTZ NOT NULL,
  "transformation_id" TEXT NOT NULL,
  "run_id" UUID NOT NULL,
  "checksum" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lineage_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lineage_records_checksum_format" CHECK ("checksum" ~ '^[0-9a-fA-F]{64}$')
);
CREATE INDEX "lineage_records_figure_ref_idx" ON "integration"."lineage_records"("figure_ref");
CREATE INDEX "lineage_records_run_id_idx" ON "integration"."lineage_records"("run_id");
CREATE INDEX "lineage_records_transformation_id_idx" ON "integration"."lineage_records"("transformation_id");
