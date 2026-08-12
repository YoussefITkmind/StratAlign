CREATE SCHEMA IF NOT EXISTS "scorecard";

CREATE TYPE "scorecard"."strategy_map_state" AS ENUM ('draft', 'published');
CREATE TYPE "scorecard"."map_link_strength" AS ENUM ('weak', 'strong');

CREATE TABLE "scorecard"."scorecards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "scope_node_id" UUID,
  "plan_version_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scorecard"."perspectives" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scorecard_id" UUID NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "perspectives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "perspectives_scorecard_order_key" UNIQUE ("scorecard_id", "order")
);

CREATE TABLE "scorecard"."placements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "perspective_id" UUID NOT NULL,
  "objective_node_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "placements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "placements_perspective_objective_key" UNIQUE ("perspective_id", "objective_node_id")
);

CREATE TABLE "scorecard"."weighting_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scorecard_id" UUID NOT NULL,
  "perspective_weights" JSONB NOT NULL,
  "scoring_formula_id" TEXT NOT NULL,
  "active_from" TIMESTAMP(3) NOT NULL,
  "supersedes_id" UUID UNIQUE,
  "approval_case_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weighting_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scorecard"."strategy_maps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scorecard_id" UUID NOT NULL,
  "state" "scorecard"."strategy_map_state" NOT NULL DEFAULT 'draft',
  "approval_case_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_maps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scorecard"."map_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "strategy_map_id" UUID NOT NULL,
  "from_objective_id" UUID NOT NULL,
  "to_objective_id" UUID NOT NULL,
  "strength" "scorecard"."map_link_strength" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "map_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "map_links_no_self_link" CHECK ("from_objective_id" <> "to_objective_id"),
  CONSTRAINT "map_links_unique_edge" UNIQUE ("strategy_map_id", "from_objective_id", "to_objective_id")
);

CREATE INDEX "scorecards_scope_node_id_idx" ON "scorecard"."scorecards"("scope_node_id");
CREATE INDEX "scorecards_plan_version_id_idx" ON "scorecard"."scorecards"("plan_version_id");
CREATE INDEX "perspectives_scorecard_id_idx" ON "scorecard"."perspectives"("scorecard_id");
CREATE INDEX "placements_objective_node_id_idx" ON "scorecard"."placements"("objective_node_id");
CREATE INDEX "weighting_versions_scorecard_active_from_idx" ON "scorecard"."weighting_versions"("scorecard_id", "active_from" DESC);
CREATE INDEX "weighting_versions_scoring_formula_id_idx" ON "scorecard"."weighting_versions"("scoring_formula_id");
CREATE INDEX "strategy_maps_scorecard_state_idx" ON "scorecard"."strategy_maps"("scorecard_id", "state");
CREATE UNIQUE INDEX "strategy_maps_one_published_per_scorecard" ON "scorecard"."strategy_maps"("scorecard_id") WHERE "state" = 'published';
CREATE INDEX "map_links_from_objective_id_idx" ON "scorecard"."map_links"("from_objective_id");
CREATE INDEX "map_links_to_objective_id_idx" ON "scorecard"."map_links"("to_objective_id");

ALTER TABLE "scorecard"."scorecards" ADD CONSTRAINT "scorecards_scope_node_id_fkey" FOREIGN KEY ("scope_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."scorecards" ADD CONSTRAINT "scorecards_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."perspectives" ADD CONSTRAINT "perspectives_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"."scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard"."placements" ADD CONSTRAINT "placements_perspective_id_fkey" FOREIGN KEY ("perspective_id") REFERENCES "scorecard"."perspectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard"."placements" ADD CONSTRAINT "placements_objective_node_id_fkey" FOREIGN KEY ("objective_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."weighting_versions" ADD CONSTRAINT "weighting_versions_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"."scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard"."weighting_versions" ADD CONSTRAINT "weighting_versions_scoring_formula_id_fkey" FOREIGN KEY ("scoring_formula_id") REFERENCES "rules"."rule_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."weighting_versions" ADD CONSTRAINT "weighting_versions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "scorecard"."weighting_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."weighting_versions" ADD CONSTRAINT "weighting_versions_approval_case_id_fkey" FOREIGN KEY ("approval_case_id") REFERENCES "governance"."approval_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."strategy_maps" ADD CONSTRAINT "strategy_maps_scorecard_id_fkey" FOREIGN KEY ("scorecard_id") REFERENCES "scorecard"."scorecards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard"."strategy_maps" ADD CONSTRAINT "strategy_maps_approval_case_id_fkey" FOREIGN KEY ("approval_case_id") REFERENCES "governance"."approval_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."map_links" ADD CONSTRAINT "map_links_strategy_map_id_fkey" FOREIGN KEY ("strategy_map_id") REFERENCES "scorecard"."strategy_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scorecard"."map_links" ADD CONSTRAINT "map_links_from_objective_id_fkey" FOREIGN KEY ("from_objective_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scorecard"."map_links" ADD CONSTRAINT "map_links_to_objective_id_fkey" FOREIGN KEY ("to_objective_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
