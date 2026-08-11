-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "performance";

-- CreateEnum
CREATE TYPE "performance"."MeasurementSource" AS ENUM ('manual', 'feed', 'template');

-- CreateEnum
CREATE TYPE "performance"."CaptureSessionState" AS ENUM ('draft', 'submitted', 'recalled');

-- CreateTable
CREATE TABLE "performance"."measurements" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "source" "performance"."MeasurementSource" NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" TEXT,
    "submitted_by" TEXT,
    "evidence_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."target_series" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "target_value" DECIMAL(20,6) NOT NULL,
    "plan_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."status_results" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "rule_version_used" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."rollup_results" (
    "id" TEXT NOT NULL,
    "parent_kpi_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "aggregated_value" DECIMAL(20,6) NOT NULL,
    "method" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rollup_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."commentary" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body_en" TEXT,
    "body_ar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commentary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."capture_sessions" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "state" "performance"."CaptureSessionState" NOT NULL,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurement_unique_per_period" ON "performance"."measurements"("kpi_version_id", "scope_node_id", "period", "supersedes_id");

-- CreateIndex
CREATE INDEX "measurements_kpi_version_id_scope_node_id_period_idx" ON "performance"."measurements"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "measurements_supersedes_id_idx" ON "performance"."measurements"("supersedes_id");

-- CreateIndex
CREATE INDEX "measurements_submitted_by_idx" ON "performance"."measurements"("submitted_by");

-- CreateIndex
CREATE UNIQUE INDEX "target_series_kpi_version_id_scope_node_id_period_plan_version_id_key" ON "performance"."target_series"("kpi_version_id", "scope_node_id", "period", "plan_version_id");

-- CreateIndex
CREATE INDEX "target_series_kpi_version_id_scope_node_id_period_idx" ON "performance"."target_series"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "status_results_kpi_version_id_scope_node_id_period_key" ON "performance"."status_results"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "status_results_kpi_version_id_scope_node_id_period_idx" ON "performance"."status_results"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "status_results_rule_version_used_idx" ON "performance"."status_results"("rule_version_used");

-- CreateIndex
CREATE UNIQUE INDEX "rollup_results_parent_kpi_id_scope_node_id_period_key" ON "performance"."rollup_results"("parent_kpi_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "rollup_results_parent_kpi_id_scope_node_id_period_idx" ON "performance"."rollup_results"("parent_kpi_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "commentary_kpi_version_id_scope_node_id_period_idx" ON "performance"."commentary"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "commentary_author_id_idx" ON "performance"."commentary"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "capture_sessions_kpi_version_id_scope_node_id_period_key" ON "performance"."capture_sessions"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE INDEX "capture_sessions_owner_id_idx" ON "performance"."capture_sessions"("owner_id");

-- AddForeignKey
ALTER TABLE "performance"."measurements" ADD CONSTRAINT "measurements_kpi_version_id_fkey" FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."measurements" ADD CONSTRAINT "measurements_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "iam"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."measurements" ADD CONSTRAINT "measurements_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "performance"."measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."target_series" ADD CONSTRAINT "target_series_kpi_version_id_fkey" FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."status_results" ADD CONSTRAINT "status_results_kpi_version_id_fkey" FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."status_results" ADD CONSTRAINT "status_results_rule_version_used_fkey" FOREIGN KEY ("rule_version_used") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."rollup_results" ADD CONSTRAINT "rollup_results_parent_kpi_id_fkey" FOREIGN KEY ("parent_kpi_id") REFERENCES "registry"."kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."commentary" ADD CONSTRAINT "commentary_kpi_version_id_fkey" FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."commentary" ADD CONSTRAINT "commentary_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "iam"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."capture_sessions" ADD CONSTRAINT "capture_sessions_kpi_version_id_fkey" FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."capture_sessions" ADD CONSTRAINT "capture_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "iam"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Postgres-level immutability enforcement for measurements
-- This trigger function revokes UPDATE and DELETE permissions on the measurements table
-- for the application role, ensuring measurements can only be inserted (never updated or deleted).
-- Corrections must append new records with supersedesId.

CREATE OR REPLACE FUNCTION performance.enforce_measurement_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Measurements are immutable. Use supersession instead of UPDATE/DELETE.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_measurement_update
    BEFORE UPDATE ON "performance"."measurements"
    FOR EACH ROW EXECUTE FUNCTION performance.enforce_measurement_immutability();

CREATE TRIGGER prevent_measurement_delete
    BEFORE DELETE ON "performance"."measurements"
    FOR EACH ROW EXECUTE FUNCTION performance.enforce_measurement_immutability();
