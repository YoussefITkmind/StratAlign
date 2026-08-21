-- Task 3: AI-suggested OKRs / KPIs at theme level.

-- A key result read as a bare "95 %" with no statement of what reaches 95.
-- Nullable so every row written before this migration stays valid.
ALTER TABLE "registry"."key_results"
  ADD COLUMN "title_en" TEXT,
  ADD COLUMN "title_ar" TEXT;

-- Themes sit above objectives, and had no alignment member of their own. A KPI
-- raised against a theme would otherwise have to be recorded as an objective
-- alignment, which is not what it is. Additive, so existing rows are untouched.
ALTER TYPE "registry"."AlignmentType" ADD VALUE IF NOT EXISTS 'theme';

-- Provenance for accepted AI proposals.
--
-- Deliberately a side table. "registry"."kpi_versions" is append-only and
-- protected by an immutability trigger, and "registry"."okrs" carries no
-- metadata column; widening either to hold an origin flag would weaken a
-- guarantee that exists for audit reasons.
CREATE TYPE "registry"."AiSuggestionSubjectType" AS ENUM ('kpi_definition', 'okr');

CREATE TABLE "registry"."ai_suggestion_provenance" (
    "id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "generation_id" TEXT NOT NULL,
    "subject_type" "registry"."AiSuggestionSubjectType" NOT NULL,
    "subject_id" TEXT NOT NULL,
    "theme_node_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "accepted_by" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_suggestion_provenance_pkey" PRIMARY KEY ("id")
);

-- The idempotency contract: one proposal can only ever become one record, so a
-- retried or replayed accept resolves to what already exists.
CREATE UNIQUE INDEX "ai_suggestion_provenance_suggestion_id_key"
  ON "registry"."ai_suggestion_provenance"("suggestion_id");

-- And the reverse: one created record has at most one originating proposal.
CREATE UNIQUE INDEX "ai_suggestion_provenance_subject_type_subject_id_key"
  ON "registry"."ai_suggestion_provenance"("subject_type", "subject_id");

CREATE INDEX "ai_suggestion_provenance_theme_node_id_idx"
  ON "registry"."ai_suggestion_provenance"("theme_node_id");

CREATE INDEX "ai_suggestion_provenance_accepted_by_idx"
  ON "registry"."ai_suggestion_provenance"("accepted_by");

CREATE INDEX "ai_suggestion_provenance_generation_id_idx"
  ON "registry"."ai_suggestion_provenance"("generation_id");

ALTER TABLE "registry"."ai_suggestion_provenance"
  ADD CONSTRAINT "ai_suggestion_provenance_theme_node_id_fkey"
    FOREIGN KEY ("theme_node_id") REFERENCES "strategy"."strategy_nodes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registry"."ai_suggestion_provenance"
  ADD CONSTRAINT "ai_suggestion_provenance_accepted_by_fkey"
    FOREIGN KEY ("accepted_by") REFERENCES "iam"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "registry"."ai_suggestion_provenance"
  ADD CONSTRAINT "ai_suggestion_provenance_confidence_check"
    CHECK ("confidence" >= 0 AND "confidence" <= 1);
