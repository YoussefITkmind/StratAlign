CREATE SCHEMA IF NOT EXISTS "strategy";

CREATE TYPE "strategy"."StrategyNodeType" AS ENUM ('corporate_strategy', 'theme', 'objective', 'strategic_play', 'portfolio', 'area_of_focus');
CREATE TYPE "strategy"."StrategyNodeState" AS ENUM ('draft', 'active', 'retired');
CREATE TYPE "strategy"."StrategyEdgeType" AS ENUM ('contains', 'executed_by', 'belongs_to_portfolio', 'aligns_to');
CREATE TYPE "strategy"."PlanVersionState" AS ENUM ('draft', 'active', 'retired');

CREATE TABLE "strategy"."plan_versions" (
  "id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "state" "strategy"."PlanVersionState" NOT NULL DEFAULT 'draft',
  "effective_from" TIMESTAMP(3),
  "effective_to" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_versions_version_key" ON "strategy"."plan_versions"("version");
CREATE INDEX "plan_versions_state_idx" ON "strategy"."plan_versions"("state");

CREATE TABLE "strategy"."strategy_nodes" (
  "id" UUID NOT NULL,
  "type" "strategy"."StrategyNodeType" NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "plan_version_id" UUID NOT NULL,
  "state" "strategy"."StrategyNodeState" NOT NULL DEFAULT 'draft',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_nodes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_nodes_plan_version_id_type_idx" ON "strategy"."strategy_nodes"("plan_version_id", "type");
CREATE INDEX "strategy_nodes_plan_version_id_state_idx" ON "strategy"."strategy_nodes"("plan_version_id", "state");

CREATE TABLE "strategy"."relationship_rules" (
  "id" UUID NOT NULL,
  "from_type" "strategy"."StrategyNodeType" NOT NULL,
  "to_type" "strategy"."StrategyNodeType" NOT NULL,
  "edge_type" "strategy"."StrategyEdgeType" NOT NULL,
  CONSTRAINT "relationship_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "relationship_rules_from_type_to_type_edge_type_key"
  ON "strategy"."relationship_rules"("from_type", "to_type", "edge_type");

CREATE TABLE "strategy"."strategy_edges" (
  "id" UUID NOT NULL,
  "from_node_id" UUID NOT NULL,
  "to_node_id" UUID NOT NULL,
  "edge_type" "strategy"."StrategyEdgeType" NOT NULL,
  "plan_version_id" UUID NOT NULL,
  CONSTRAINT "strategy_edges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strategy_edges_no_self_link" CHECK ("from_node_id" <> "to_node_id")
);

CREATE UNIQUE INDEX "strategy_edges_from_node_id_to_node_id_edge_type_plan_version_id_key"
  ON "strategy"."strategy_edges"("from_node_id", "to_node_id", "edge_type", "plan_version_id");
CREATE INDEX "strategy_edges_from_node_id_idx" ON "strategy"."strategy_edges"("from_node_id");
CREATE INDEX "strategy_edges_to_node_id_idx" ON "strategy"."strategy_edges"("to_node_id");
CREATE INDEX "strategy_edges_plan_version_id_idx" ON "strategy"."strategy_edges"("plan_version_id");

CREATE TABLE "strategy"."owner_assignments" (
  "id" UUID NOT NULL,
  "node_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plan_version_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "owner_assignments_node_id_user_id_plan_version_id_key"
  ON "strategy"."owner_assignments"("node_id", "user_id", "plan_version_id");
CREATE INDEX "owner_assignments_user_id_idx" ON "strategy"."owner_assignments"("user_id");
CREATE INDEX "owner_assignments_plan_version_id_idx" ON "strategy"."owner_assignments"("plan_version_id");

ALTER TABLE "strategy"."strategy_nodes"
  ADD CONSTRAINT "strategy_nodes_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."strategy_edges"
  ADD CONSTRAINT "strategy_edges_from_node_id_fkey" FOREIGN KEY ("from_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy"."strategy_edges"
  ADD CONSTRAINT "strategy_edges_to_node_id_fkey" FOREIGN KEY ("to_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy"."strategy_edges"
  ADD CONSTRAINT "strategy_edges_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."owner_assignments"
  ADD CONSTRAINT "owner_assignments_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategy"."owner_assignments"
  ADD CONSTRAINT "owner_assignments_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."owner_assignments"
  ADD CONSTRAINT "owner_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "strategy"."relationship_rules" ("id", "from_type", "to_type", "edge_type") VALUES
  (gen_random_uuid(), 'corporate_strategy', 'theme', 'contains'),
  (gen_random_uuid(), 'theme', 'objective', 'contains'),
  (gen_random_uuid(), 'objective', 'strategic_play', 'executed_by'),
  (gen_random_uuid(), 'strategic_play', 'portfolio', 'belongs_to_portfolio'),
  (gen_random_uuid(), 'strategic_play', 'area_of_focus', 'aligns_to'),
  (gen_random_uuid(), 'objective', 'area_of_focus', 'aligns_to');

CREATE OR REPLACE FUNCTION "strategy"."validate_strategy_edge"()
RETURNS TRIGGER AS $$
DECLARE
  source_type "strategy"."StrategyNodeType";
  target_type "strategy"."StrategyNodeType";
  source_plan UUID;
  target_plan UUID;
BEGIN
  SELECT "type", "plan_version_id" INTO source_type, source_plan FROM "strategy"."strategy_nodes" WHERE "id" = NEW."from_node_id";
  SELECT "type", "plan_version_id" INTO target_type, target_plan FROM "strategy"."strategy_nodes" WHERE "id" = NEW."to_node_id";

  IF source_plan IS NULL OR target_plan IS NULL OR source_plan <> NEW."plan_version_id" OR target_plan <> NEW."plan_version_id" THEN
    RAISE EXCEPTION 'strategy edge nodes must belong to the same plan version';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "strategy"."relationship_rules"
    WHERE "from_type" = source_type AND "to_type" = target_type AND "edge_type" = NEW."edge_type"
  ) THEN
    RAISE EXCEPTION 'invalid strategy relationship: % -[%]-> %', source_type, NEW."edge_type", target_type;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "strategy_edges_validate_relationship"
BEFORE INSERT OR UPDATE ON "strategy"."strategy_edges"
FOR EACH ROW EXECUTE FUNCTION "strategy"."validate_strategy_edge"();

CREATE OR REPLACE FUNCTION "strategy"."validate_owner_assignment"()
RETURNS TRIGGER AS $$
DECLARE node_plan UUID;
BEGIN
  SELECT "plan_version_id" INTO node_plan FROM "strategy"."strategy_nodes" WHERE "id" = NEW."node_id";
  IF node_plan IS NULL OR node_plan <> NEW."plan_version_id" THEN
    RAISE EXCEPTION 'owner assignment must use the node plan version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "owner_assignments_validate_plan"
BEFORE INSERT OR UPDATE ON "strategy"."owner_assignments"
FOR EACH ROW EXECUTE FUNCTION "strategy"."validate_owner_assignment"();
