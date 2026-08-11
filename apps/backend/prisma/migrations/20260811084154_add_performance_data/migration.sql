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
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "value" DECIMAL(20,6) NOT NULL,
    "source" "performance"."MeasurementSource" NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "supersedes_id" TEXT,
    "submitted_by" TEXT NOT NULL,
    "evidence_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."target_series" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "target_value" DECIMAL(20,6) NOT NULL,
    "plan_version_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "target_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."status_results" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rule_version_used" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,

    CONSTRAINT "status_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."rollup_results" (
    "id" TEXT NOT NULL,
    "parent_kpi_id" TEXT NOT NULL,
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "aggregated_value" DECIMAL(20,6),
    "method" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rule_version_used" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,

    CONSTRAINT "rollup_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."commentary" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body_en" TEXT,
    "body_ar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commentary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."capture_sessions" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "scope_node_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "state" "performance"."CaptureSessionState" NOT NULL DEFAULT 'draft',
    "owner_id" TEXT NOT NULL,
    "submitted_measurement_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "recalled_at" TIMESTAMP(3),
    "recall_deadline_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance"."kpi_bindings" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "threshold_rule_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "measurements_supersedes_id_key" ON "performance"."measurements"("supersedes_id");

-- CreateIndex
CREATE INDEX "measurements_kpi_version_id_scope_node_id_period_created_at_idx" ON "performance"."measurements"("kpi_version_id", "scope_node_id", "period", "created_at");

-- CreateIndex
CREATE INDEX "measurements_kpi_version_id_idx" ON "performance"."measurements"("kpi_version_id");

-- CreateIndex
CREATE INDEX "measurements_scope_node_id_idx" ON "performance"."measurements"("scope_node_id");

-- CreateIndex
CREATE INDEX "measurements_period_idx" ON "performance"."measurements"("period");

-- CreateIndex
CREATE INDEX "measurements_created_at_idx" ON "performance"."measurements"("created_at");

-- CreateIndex
CREATE INDEX "measurements_submitted_by_idx" ON "performance"."measurements"("submitted_by");

-- CreateIndex
CREATE INDEX "target_series_kpi_version_id_scope_node_id_period_idx" ON "performance"."target_series"("kpi_version_id", "scope_node_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "target_series_kpi_scope_period_plan_key" ON "performance"."target_series"("kpi_version_id", "scope_node_id", "period", "plan_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "status_results_dedupe_key_key" ON "performance"."status_results"("dedupe_key");

-- CreateIndex
CREATE INDEX "status_results_kpi_version_id_scope_node_id_period_computed_idx" ON "performance"."status_results"("kpi_version_id", "scope_node_id", "period", "computed_at");

-- CreateIndex
CREATE INDEX "status_results_computed_at_idx" ON "performance"."status_results"("computed_at");

-- CreateIndex
CREATE INDEX "status_results_rule_version_used_idx" ON "performance"."status_results"("rule_version_used");

-- CreateIndex
CREATE UNIQUE INDEX "rollup_results_dedupe_key_key" ON "performance"."rollup_results"("dedupe_key");

-- CreateIndex
CREATE INDEX "rollup_results_parent_kpi_id_scope_node_id_period_computed__idx" ON "performance"."rollup_results"("parent_kpi_id", "scope_node_id", "period", "computed_at");

-- CreateIndex
CREATE INDEX "rollup_results_computed_at_idx" ON "performance"."rollup_results"("computed_at");

-- CreateIndex
CREATE INDEX "rollup_results_rule_version_used_idx" ON "performance"."rollup_results"("rule_version_used");

-- CreateIndex
CREATE INDEX "commentary_kpi_version_id_scope_node_id_period_created_at_idx" ON "performance"."commentary"("kpi_version_id", "scope_node_id", "period", "created_at");

-- CreateIndex
CREATE INDEX "commentary_author_id_idx" ON "performance"."commentary"("author_id");

-- CreateIndex
CREATE INDEX "capture_sessions_kpi_version_id_scope_node_id_period_state_idx" ON "performance"."capture_sessions"("kpi_version_id", "scope_node_id", "period", "state");

-- CreateIndex
CREATE INDEX "capture_sessions_owner_id_idx" ON "performance"."capture_sessions"("owner_id");

-- CreateIndex
CREATE INDEX "capture_sessions_state_idx" ON "performance"."capture_sessions"("state");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_bindings_kpi_version_id_key" ON "performance"."kpi_bindings"("kpi_version_id");

-- CreateIndex
CREATE INDEX "kpi_bindings_threshold_rule_key_idx" ON "performance"."kpi_bindings"("threshold_rule_key");

-- AddForeignKey
ALTER TABLE "performance"."measurements" ADD CONSTRAINT "measurements_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."measurements" ADD CONSTRAINT "measurements_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "performance"."measurements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."status_results" ADD CONSTRAINT "status_results_rule_version_used_fkey" FOREIGN KEY ("rule_version_used") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."rollup_results" ADD CONSTRAINT "rollup_results_rule_version_used_fkey" FOREIGN KEY ("rule_version_used") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."commentary" ADD CONSTRAINT "commentary_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance"."capture_sessions" ADD CONSTRAINT "capture_sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Performance -> Registry / Strategy foreign keys
ALTER TABLE "performance"."measurements"
ADD CONSTRAINT "measurements_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."measurements"
ADD CONSTRAINT "measurements_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."target_series"
ADD CONSTRAINT "target_series_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."target_series"
ADD CONSTRAINT "target_series_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."target_series"
ADD CONSTRAINT "target_series_plan_version_id_fkey"
FOREIGN KEY ("plan_version_id")
REFERENCES "strategy"."plan_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."status_results"
ADD CONSTRAINT "status_results_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."status_results"
ADD CONSTRAINT "status_results_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."rollup_results"
ADD CONSTRAINT "rollup_results_parent_kpi_id_fkey"
FOREIGN KEY ("parent_kpi_id")
REFERENCES "registry"."kpi_definitions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."rollup_results"
ADD CONSTRAINT "rollup_results_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."commentary"
ADD CONSTRAINT "commentary_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."commentary"
ADD CONSTRAINT "commentary_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."capture_sessions"
ADD CONSTRAINT "capture_sessions_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."capture_sessions"
ADD CONSTRAINT "capture_sessions_scope_node_id_fkey"
FOREIGN KEY ("scope_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;



-- Temporary threshold binding -> Registry KPI version
ALTER TABLE "performance"."kpi_bindings"
ADD CONSTRAINT "kpi_bindings_kpi_version_id_fkey"
FOREIGN KEY ("kpi_version_id")
REFERENCES "registry"."kpi_versions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
