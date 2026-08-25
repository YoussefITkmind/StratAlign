ALTER TABLE "scorecard"."scorecards"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "department" TEXT NOT NULL DEFAULT 'Corporate',
  ADD COLUMN "period" TEXT NOT NULL DEFAULT '—',
  ADD COLUMN "owner_name" TEXT NOT NULL DEFAULT 'Unassigned',
  ADD COLUMN "owner_initials" VARCHAR(2),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "prior_score" DECIMAL(5,2),
  ADD COLUMN "review_frequency" TEXT,
  ADD COLUMN "start_period" TEXT,
  ADD COLUMN "end_period" TEXT,
  ADD COLUMN "strategy_name" TEXT,
  ADD COLUMN "strategic_theme" TEXT,
  ADD COLUMN "strategic_objective" TEXT,
  ADD COLUMN "primary_perspective" TEXT,
  ADD COLUMN "strategic_weight" DECIMAL(5,2),
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notes" TEXT;

ALTER TABLE "scorecard"."scorecards"
  ADD CONSTRAINT "scorecards_status_check"
    CHECK ("status" IN ('on-track', 'at-risk', 'draft')),
  ADD CONSTRAINT "scorecards_primary_perspective_check"
    CHECK ("primary_perspective" IS NULL OR "primary_perspective" IN ('all', 'financial', 'customer', 'internal-process', 'learning-growth')),
  ADD CONSTRAINT "scorecards_score_check"
    CHECK ("score" >= 0 AND "score" <= 100),
  ADD CONSTRAINT "scorecards_prior_score_check"
    CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  ADD CONSTRAINT "scorecards_strategic_weight_check"
    CHECK ("strategic_weight" IS NULL OR ("strategic_weight" >= 0 AND "strategic_weight" <= 100));

ALTER TABLE "scorecard"."perspectives"
  ADD COLUMN "perspective_key" TEXT,
  ADD COLUMN "owner_initials" VARCHAR(2),
  ADD COLUMN "owner_color" TEXT,
  ADD COLUMN "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "prior_score" DECIMAL(5,2),
  ADD COLUMN "weight" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "scorecard"."perspectives"
  ADD CONSTRAINT "perspectives_key_check"
    CHECK ("perspective_key" IS NULL OR "perspective_key" IN ('financial', 'customer', 'internal-process', 'learning-growth')),
  ADD CONSTRAINT "perspectives_score_check"
    CHECK ("score" >= 0 AND "score" <= 100),
  ADD CONSTRAINT "perspectives_prior_score_check"
    CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  ADD CONSTRAINT "perspectives_weight_check"
    CHECK ("weight" >= 0 AND "weight" <= 100);

CREATE TABLE "scorecard"."kpi_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "perspective_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "owner_initials" VARCHAR(2),
  "owner_color" TEXT,
  "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "prior_score" DECIMAL(5,2),
  "weight" DECIMAL(5,2),
  "actual" TEXT,
  "target" TEXT,
  "variance" TEXT,
  "trend" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "kpi_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kpi_snapshots_status_check" CHECK ("status" IN ('on-track', 'at-risk', 'draft')),
  CONSTRAINT "kpi_snapshots_score_check" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "kpi_snapshots_prior_score_check" CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  CONSTRAINT "kpi_snapshots_weight_check" CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100)),
  CONSTRAINT "kpi_snapshots_perspective_id_fkey" FOREIGN KEY ("perspective_id") REFERENCES "scorecard"."perspectives"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "scorecards_department_idx" ON "scorecard"."scorecards"("department");
CREATE INDEX "scorecards_status_idx" ON "scorecard"."scorecards"("status");
CREATE INDEX "kpi_snapshots_perspective_id_idx" ON "scorecard"."kpi_snapshots"("perspective_id");
CREATE INDEX "kpi_snapshots_status_idx" ON "scorecard"."kpi_snapshots"("status");
