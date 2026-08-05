-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "rules";

-- CreateEnum
CREATE TYPE "rules"."RuleType" AS ENUM ('threshold_status', 'rollup', 'variance_alert', 'rag_aggregation', 'gate_criteria');

-- CreateEnum
CREATE TYPE "rules"."RuleDefinitionStatus" AS ENUM ('draft', 'published', 'superseded');

-- AlterTable
ALTER TABLE "iam"."group_role_mappings" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "iam"."roles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "iam"."scope_grants" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "rules"."rule_definitions" (
    "id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_type" "rules"."RuleType" NOT NULL,
    "name" TEXT NOT NULL,
    "document_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "rules"."RuleDefinitionStatus" NOT NULL DEFAULT 'draft',
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMP(3),
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "rule_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rule_definitions_supersedes_id_key" ON "rules"."rule_definitions"("supersedes_id");

-- CreateIndex
CREATE INDEX "rule_definitions_rule_key_is_current_idx" ON "rules"."rule_definitions"("rule_key", "is_current");

-- CreateIndex
CREATE INDEX "rule_definitions_rule_type_idx" ON "rules"."rule_definitions"("rule_type");

-- CreateIndex
CREATE INDEX "rule_definitions_status_idx" ON "rules"."rule_definitions"("status");

-- CreateIndex
CREATE INDEX "rule_definitions_published_at_idx" ON "rules"."rule_definitions"("published_at");

-- CreateIndex
CREATE INDEX "rule_definitions_created_by_idx" ON "rules"."rule_definitions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "rule_definitions_rule_key_version_key" ON "rules"."rule_definitions"("rule_key", "version");

-- AddForeignKey
ALTER TABLE "rules"."rule_definitions" ADD CONSTRAINT "rule_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules"."rule_definitions" ADD CONSTRAINT "rule_definitions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "iam"."scope_grants_user_role_scope_key" RENAME TO "scope_grants_user_id_role_id_org_scope_type_org_scope_id_key";
