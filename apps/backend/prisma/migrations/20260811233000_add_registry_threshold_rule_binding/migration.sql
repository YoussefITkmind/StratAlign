-- Registry owns the versioned relationship; Rules continues to own the
-- referenced immutable rule definitions and their publication lifecycle.
CREATE TABLE "registry"."kpi_threshold_rule_bindings" (
    "id" TEXT NOT NULL,
    "kpi_version_id" TEXT NOT NULL,
    "threshold_rule_id" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "supersedes_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "kpi_threshold_rule_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kpi_threshold_rule_bindings_supersedes_id_key"
    ON "registry"."kpi_threshold_rule_bindings"("supersedes_id");

CREATE UNIQUE INDEX "kpi_threshold_rule_bindings_one_current_per_version"
    ON "registry"."kpi_threshold_rule_bindings"("kpi_version_id")
    WHERE "is_current" = true;

CREATE INDEX "kpi_threshold_rule_bindings_kpi_version_id_is_current_idx"
    ON "registry"."kpi_threshold_rule_bindings"("kpi_version_id", "is_current");

CREATE INDEX "kpi_threshold_rule_bindings_threshold_rule_id_idx"
    ON "registry"."kpi_threshold_rule_bindings"("threshold_rule_id");

CREATE INDEX "kpi_threshold_rule_bindings_created_by_idx"
    ON "registry"."kpi_threshold_rule_bindings"("created_by");

ALTER TABLE "registry"."kpi_threshold_rule_bindings"
    ADD CONSTRAINT "kpi_threshold_rule_bindings_kpi_version_id_fkey"
    FOREIGN KEY ("kpi_version_id") REFERENCES "registry"."kpi_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registry"."kpi_threshold_rule_bindings"
    ADD CONSTRAINT "kpi_threshold_rule_bindings_threshold_rule_id_fkey"
    FOREIGN KEY ("threshold_rule_id") REFERENCES "rules"."rule_definitions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registry"."kpi_threshold_rule_bindings"
    ADD CONSTRAINT "kpi_threshold_rule_bindings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registry"."kpi_threshold_rule_bindings"
    ADD CONSTRAINT "kpi_threshold_rule_bindings_supersedes_id_fkey"
    FOREIGN KEY ("supersedes_id") REFERENCES "registry"."kpi_threshold_rule_bindings"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
