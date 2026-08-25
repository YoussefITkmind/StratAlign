CREATE TABLE "scorecard"."balanced_scorecard_profiles" (
  "scorecard_id" UUID NOT NULL,
  "description" TEXT,
  "department" TEXT NOT NULL DEFAULT 'Corporate',
  "period" TEXT NOT NULL DEFAULT '—',
  "owner_name" TEXT NOT NULL DEFAULT 'Unassigned',
  "owner_initials" VARCHAR(2),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "prior_score" DECIMAL(5,2),
  "review_frequency" TEXT,
  "start_period" TEXT,
  "end_period" TEXT,
  "strategy_name" TEXT,
  "strategic_theme" TEXT,
  "strategic_objective" TEXT,
  "primary_perspective" TEXT,
  "strategic_weight" DECIMAL(5,2),
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balanced_scorecard_profiles_pkey" PRIMARY KEY ("scorecard_id"),
  CONSTRAINT "balanced_scorecard_profiles_scorecard_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"."scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "balanced_scorecard_profiles_status_check" CHECK ("status" IN ('on-track', 'at-risk', 'draft')),
  CONSTRAINT "balanced_scorecard_profiles_primary_perspective_check" CHECK ("primary_perspective" IS NULL OR "primary_perspective" IN ('all', 'financial', 'customer', 'internal-process', 'learning-growth')),
  CONSTRAINT "balanced_scorecard_profiles_score_check" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "balanced_scorecard_profiles_prior_score_check" CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  CONSTRAINT "balanced_scorecard_profiles_strategic_weight_check" CHECK ("strategic_weight" IS NULL OR ("strategic_weight" >= 0 AND "strategic_weight" <= 100))
);

CREATE TABLE "scorecard"."balanced_perspective_profiles" (
  "perspective_id" UUID NOT NULL,
  "perspective_key" TEXT,
  "owner_initials" VARCHAR(2),
  "owner_color" TEXT,
  "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "prior_score" DECIMAL(5,2),
  "weight" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balanced_perspective_profiles_pkey" PRIMARY KEY ("perspective_id"),
  CONSTRAINT "balanced_perspective_profiles_perspective_fkey" FOREIGN KEY ("perspective_id") REFERENCES "scorecard"."perspectives"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "balanced_perspective_profiles_key_check" CHECK ("perspective_key" IS NULL OR "perspective_key" IN ('financial', 'customer', 'internal-process', 'learning-growth')),
  CONSTRAINT "balanced_perspective_profiles_score_check" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "balanced_perspective_profiles_prior_score_check" CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  CONSTRAINT "balanced_perspective_profiles_weight_check" CHECK ("weight" >= 0 AND "weight" <= 100)
);

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
  CONSTRAINT "kpi_snapshots_perspective_id_fkey" FOREIGN KEY ("perspective_id") REFERENCES "scorecard"."perspectives"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "kpi_snapshots_status_check" CHECK ("status" IN ('on-track', 'at-risk', 'draft')),
  CONSTRAINT "kpi_snapshots_score_check" CHECK ("score" >= 0 AND "score" <= 100),
  CONSTRAINT "kpi_snapshots_prior_score_check" CHECK ("prior_score" IS NULL OR ("prior_score" >= 0 AND "prior_score" <= 100)),
  CONSTRAINT "kpi_snapshots_weight_check" CHECK ("weight" IS NULL OR ("weight" >= 0 AND "weight" <= 100))
);

CREATE INDEX "balanced_scorecard_profiles_department_idx" ON "scorecard"."balanced_scorecard_profiles"("department");
CREATE INDEX "balanced_scorecard_profiles_status_idx" ON "scorecard"."balanced_scorecard_profiles"("status");
CREATE INDEX "kpi_snapshots_perspective_id_idx" ON "scorecard"."kpi_snapshots"("perspective_id");
CREATE INDEX "kpi_snapshots_status_idx" ON "scorecard"."kpi_snapshots"("status");
