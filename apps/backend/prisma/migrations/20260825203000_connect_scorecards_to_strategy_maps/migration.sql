CREATE TABLE "scorecard"."objective_profiles" (
  "objective_node_id" UUID PRIMARY KEY,
  "scorecard_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not-started',
  "progress" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "owner_name" TEXT NOT NULL DEFAULT 'Unassigned',
  "owner_initials" VARCHAR(2),
  "owner_color" TEXT,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "objective_profiles_objective_node_id_fkey"
    FOREIGN KEY ("objective_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE,
  CONSTRAINT "objective_profiles_scorecard_id_fkey"
    FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"."scorecards"("id") ON DELETE CASCADE,
  CONSTRAINT "objective_profiles_status_check"
    CHECK ("status" IN ('on-track', 'at-risk', 'off-track', 'not-started')),
  CONSTRAINT "objective_profiles_progress_check"
    CHECK ("progress" >= 0 AND "progress" <= 100),
  CONSTRAINT "objective_profiles_scorecard_objective_key"
    UNIQUE ("scorecard_id", "objective_node_id")
);

CREATE INDEX "objective_profiles_scorecard_id_idx"
  ON "scorecard"."objective_profiles"("scorecard_id");
CREATE INDEX "objective_profiles_status_idx"
  ON "scorecard"."objective_profiles"("status");

CREATE TABLE "scorecard"."objective_kpi_links" (
  "objective_node_id" UUID NOT NULL,
  "kpi_snapshot_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "objective_kpi_links_pkey" PRIMARY KEY ("objective_node_id", "kpi_snapshot_id"),
  CONSTRAINT "objective_kpi_links_objective_node_id_fkey"
    FOREIGN KEY ("objective_node_id") REFERENCES "scorecard"."objective_profiles"("objective_node_id") ON DELETE CASCADE,
  CONSTRAINT "objective_kpi_links_kpi_snapshot_id_fkey"
    FOREIGN KEY ("kpi_snapshot_id") REFERENCES "scorecard"."kpi_snapshots"("id") ON DELETE CASCADE
);

CREATE INDEX "objective_kpi_links_kpi_snapshot_id_idx"
  ON "scorecard"."objective_kpi_links"("kpi_snapshot_id");
