-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "registry";

-- CreateEnum
CREATE TYPE "registry"."KpiStatus" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "registry"."KpiPolarity" AS ENUM ('higher_is_better', 'lower_is_better');

-- CreateEnum
CREATE TYPE "registry"."KpiFrequency" AS ENUM ('monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "registry"."KpiDataSourceType" AS ENUM ('manual', 'feed');

-- CreateEnum
CREATE TYPE "registry"."KeyResultType" AS ENUM ('quantitative', 'milestone');

-- CreateEnum
CREATE TYPE "registry"."AlignmentType" AS ENUM ('objective', 'play', 'sector', 'project');

-- CreateTable
CREATE TABLE "registry"."kpi_definitions" (
    "id" TEXT NOT NULL,
    "active_version_id" TEXT,
    "status" "registry"."KpiStatus" NOT NULL DEFAULT 'draft',
    "retired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry"."kpi_versions" (
    "id" TEXT NOT NULL,
    "kpi_definition_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "description_en" TEXT,
    "description_ar" TEXT,
    "unit" TEXT NOT NULL,
    "polarity" "registry"."KpiPolarity" NOT NULL,
    "frequency" "registry"."KpiFrequency" NOT NULL,
    "data_source_type" "registry"."KpiDataSourceType" NOT NULL,
    "calculation_logic_text" TEXT,
    "owner_user_id" TEXT NOT NULL,
    "steward_user_id" TEXT,
    "active_from" TIMESTAMP(3) NOT NULL,
    "supersedes_version_id" TEXT,
    "approval_case_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry"."okrs" (
    "id" TEXT NOT NULL,
    "objective_node_id" UUID NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "okrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry"."key_results" (
    "id" TEXT NOT NULL,
    "okr_id" TEXT NOT NULL,
    "type" "registry"."KeyResultType" NOT NULL,
    "target_value" DECIMAL(20,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "current_value" DECIMAL(20,6),
    "progress_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "key_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry"."alignments" (
    "id" TEXT NOT NULL,
    "kpi_definition_id" TEXT NOT NULL,
    "strategy_node_id" UUID NOT NULL,
    "alignment_type" "registry"."AlignmentType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry"."kpi_hierarchy_nodes" (
    "id" TEXT NOT NULL,
    "parent_kpi_id" TEXT NOT NULL,
    "child_kpi_id" TEXT NOT NULL,
    "rollup_method_rule_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_hierarchy_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_active_version_id_key" ON "registry"."kpi_definitions"("active_version_id");

-- CreateIndex
CREATE INDEX "kpi_definitions_status_idx" ON "registry"."kpi_definitions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_versions_supersedes_version_id_key" ON "registry"."kpi_versions"("supersedes_version_id");

-- CreateIndex
CREATE INDEX "kpi_versions_kpi_definition_id_active_from_idx" ON "registry"."kpi_versions"("kpi_definition_id", "active_from");

-- CreateIndex
CREATE INDEX "kpi_versions_owner_user_id_idx" ON "registry"."kpi_versions"("owner_user_id");

-- CreateIndex
CREATE INDEX "kpi_versions_steward_user_id_idx" ON "registry"."kpi_versions"("steward_user_id");

-- CreateIndex
CREATE INDEX "kpi_versions_approval_case_id_idx" ON "registry"."kpi_versions"("approval_case_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_versions_kpi_definition_id_version_key" ON "registry"."kpi_versions"("kpi_definition_id", "version");

-- CreateIndex
CREATE INDEX "okrs_objective_node_id_idx" ON "registry"."okrs"("objective_node_id");

-- CreateIndex
CREATE INDEX "key_results_okr_id_idx" ON "registry"."key_results"("okr_id");

-- CreateIndex
CREATE INDEX "alignments_kpi_definition_id_idx" ON "registry"."alignments"("kpi_definition_id");

-- CreateIndex
CREATE INDEX "alignments_strategy_node_id_idx" ON "registry"."alignments"("strategy_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "alignments_kpi_definition_id_strategy_node_id_alignment_typ_key" ON "registry"."alignments"("kpi_definition_id", "strategy_node_id", "alignment_type");

-- CreateIndex
CREATE INDEX "kpi_hierarchy_nodes_child_kpi_id_idx" ON "registry"."kpi_hierarchy_nodes"("child_kpi_id");

-- CreateIndex
CREATE INDEX "kpi_hierarchy_nodes_rollup_method_rule_id_idx" ON "registry"."kpi_hierarchy_nodes"("rollup_method_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_hierarchy_nodes_parent_kpi_id_child_kpi_id_key" ON "registry"."kpi_hierarchy_nodes"("parent_kpi_id", "child_kpi_id");

-- AddForeignKey
ALTER TABLE "registry"."kpi_definitions" ADD CONSTRAINT "kpi_definitions_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_versions" ADD CONSTRAINT "kpi_versions_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "registry"."kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_versions" ADD CONSTRAINT "kpi_versions_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_versions" ADD CONSTRAINT "kpi_versions_steward_user_id_fkey" FOREIGN KEY ("steward_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_versions" ADD CONSTRAINT "kpi_versions_supersedes_version_id_fkey" FOREIGN KEY ("supersedes_version_id") REFERENCES "registry"."kpi_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."key_results" ADD CONSTRAINT "key_results_okr_id_fkey" FOREIGN KEY ("okr_id") REFERENCES "registry"."okrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."alignments" ADD CONSTRAINT "alignments_kpi_definition_id_fkey" FOREIGN KEY ("kpi_definition_id") REFERENCES "registry"."kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_hierarchy_nodes" ADD CONSTRAINT "kpi_hierarchy_nodes_parent_kpi_id_fkey" FOREIGN KEY ("parent_kpi_id") REFERENCES "registry"."kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_hierarchy_nodes" ADD CONSTRAINT "kpi_hierarchy_nodes_child_kpi_id_fkey" FOREIGN KEY ("child_kpi_id") REFERENCES "registry"."kpi_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."kpi_hierarchy_nodes" ADD CONSTRAINT "kpi_hierarchy_nodes_rollup_method_rule_id_fkey" FOREIGN KEY ("rollup_method_rule_id") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Beyond the Prisma datamodel
--
-- Everything below is hand-written because Prisma's schema language cannot
-- express it: the trigram extension and GIN indexes that back
-- registry.kpi.findSimilar, the trigger that makes kpi_versions genuinely
-- append-only, and the check constraints.
-- ---------------------------------------------------------------------------

-- Trigram similarity. registry.kpi.findSimilar delegates ranking to
-- PostgreSQL rather than scoring candidates in application code.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes over every searchable text column, in both languages.
-- pg_trgm is encoding-agnostic, so the Arabic columns are indexed identically.
CREATE INDEX "kpi_versions_name_en_trgm_idx"
    ON "registry"."kpi_versions" USING gin ("name_en" gin_trgm_ops);

CREATE INDEX "kpi_versions_description_en_trgm_idx"
    ON "registry"."kpi_versions" USING gin ("description_en" gin_trgm_ops);

CREATE INDEX "kpi_versions_name_ar_trgm_idx"
    ON "registry"."kpi_versions" USING gin ("name_ar" gin_trgm_ops);

CREATE INDEX "kpi_versions_description_ar_trgm_idx"
    ON "registry"."kpi_versions" USING gin ("description_ar" gin_trgm_ops);

-- A KPI may hold at most one unpublished draft version at a time, mirroring
-- the single-open-draft rule RuleDefinition enforces in application code.
-- Expressed as a partial unique index so concurrent createDraft calls collide
-- in the database rather than racing.
CREATE UNIQUE INDEX "kpi_versions_one_open_draft_per_kpi"
    ON "registry"."kpi_versions" ("kpi_definition_id")
    WHERE "published_at" IS NULL;

-- Version numbers are 1-based and monotonic.
ALTER TABLE "registry"."kpi_versions"
    ADD CONSTRAINT "kpi_versions_version_positive" CHECK ("version" > 0);

-- A KPI cannot roll up into itself. Deeper cycles are not expressible as a
-- constraint and are rejected by KpiHierarchyService.
ALTER TABLE "registry"."kpi_hierarchy_nodes"
    ADD CONSTRAINT "kpi_hierarchy_nodes_no_self_reference"
    CHECK ("parent_kpi_id" <> "child_kpi_id");

-- Append-only enforcement.
--
-- Version *content* is frozen for the lifetime of the row. The three
-- publication-transition columns are write-once: a draft row may be stamped
-- once when it is published, and never touched again. DELETE is refused
-- outright, so retirement can never erase history.
--
-- This is a row-level trigger, so it does not fire on TRUNCATE; the
-- integration harness relies on that to reset between tests.
CREATE OR REPLACE FUNCTION "registry"."kpi_versions_enforce_append_only"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    frozen_old jsonb;
    frozen_new jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION
            'registry.kpi_versions is append-only: version % cannot be deleted', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;

    frozen_old := to_jsonb(OLD) - 'published_at' - 'approval_case_id' - 'supersedes_version_id';
    frozen_new := to_jsonb(NEW) - 'published_at' - 'approval_case_id' - 'supersedes_version_id';

    IF frozen_old IS DISTINCT FROM frozen_new THEN
        RAISE EXCEPTION
            'registry.kpi_versions is append-only: content of version % cannot be modified', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD."published_at" IS NOT NULL
        AND NEW."published_at" IS DISTINCT FROM OLD."published_at" THEN
        RAISE EXCEPTION
            'registry.kpi_versions: published_at is write-once (version %)', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD."approval_case_id" IS NOT NULL
        AND NEW."approval_case_id" IS DISTINCT FROM OLD."approval_case_id" THEN
        RAISE EXCEPTION
            'registry.kpi_versions: approval_case_id is write-once (version %)', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD."supersedes_version_id" IS NOT NULL
        AND NEW."supersedes_version_id" IS DISTINCT FROM OLD."supersedes_version_id" THEN
        RAISE EXCEPTION
            'registry.kpi_versions: supersedes_version_id is write-once (version %)', OLD."id"
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "kpi_versions_append_only"
    BEFORE UPDATE OR DELETE ON "registry"."kpi_versions"
    FOR EACH ROW
    EXECUTE FUNCTION "registry"."kpi_versions_enforce_append_only"();

-- AddForeignKey
ALTER TABLE "registry"."okrs"
ADD CONSTRAINT "okrs_objective_node_id_fkey"
FOREIGN KEY ("objective_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registry"."alignments"
ADD CONSTRAINT "alignments_strategy_node_id_fkey"
FOREIGN KEY ("strategy_node_id")
REFERENCES "strategy"."strategy_nodes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
