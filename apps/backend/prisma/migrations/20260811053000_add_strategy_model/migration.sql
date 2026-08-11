BEGIN;

CREATE SCHEMA IF NOT EXISTS "strategy";

CREATE TYPE "strategy"."StrategyNodeType" AS ENUM ('corporate_strategy', 'theme', 'objective', 'strategic_play', 'portfolio', 'area_of_focus');
CREATE TYPE "strategy"."StrategyNodeState" AS ENUM ('draft', 'active', 'retired');
CREATE TYPE "strategy"."StrategyEdgeType" AS ENUM ('contains', 'executed_by', 'belongs_to_portfolio', 'aligns_to');
CREATE TYPE "strategy"."PlanVersionStatus" AS ENUM ('draft', 'active', 'closed');
CREATE TYPE "strategy"."StagedChangeKind" AS ENUM ('node_create', 'node_update', 'node_retire', 'edge_link', 'edge_unlink');
CREATE TYPE "strategy"."StagedChangeStatus" AS ENUM ('pending', 'applied', 'cancelled');

CREATE TABLE "strategy"."plan_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "status" "strategy"."PlanVersionStatus" NOT NULL DEFAULT 'draft',
  "opens_at" TIMESTAMP(3),
  "closes_at" TIMESTAMP(3),
  "source_plan_version_id" UUID,
  CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_versions_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "plan_versions_range_check" CHECK ("closes_at" IS NULL OR "opens_at" IS NULL OR "closes_at" >= "opens_at")
);
CREATE UNIQUE INDEX "plan_versions_one_active_idx" ON "strategy"."plan_versions" ((1)) WHERE "status" = 'active';
CREATE INDEX "plan_versions_status_idx" ON "strategy"."plan_versions"("status");
CREATE INDEX "plan_versions_source_idx" ON "strategy"."plan_versions"("source_plan_version_id");

CREATE TABLE "strategy"."strategy_nodes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "strategy"."StrategyNodeType" NOT NULL,
  "name_en" TEXT NOT NULL,
  "name_ar" TEXT NOT NULL,
  "plan_version_id" UUID NOT NULL,
  "state" "strategy"."StrategyNodeState" NOT NULL DEFAULT 'draft',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "strategy_nodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strategy_nodes_name_en_check" CHECK (length(btrim("name_en")) > 0),
  CONSTRAINT "strategy_nodes_name_ar_check" CHECK (length(btrim("name_ar")) > 0)
);
CREATE INDEX "strategy_nodes_plan_type_idx" ON "strategy"."strategy_nodes"("plan_version_id", "type");
CREATE INDEX "strategy_nodes_plan_state_idx" ON "strategy"."strategy_nodes"("plan_version_id", "state");

CREATE TABLE "strategy"."relationship_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "from_type" "strategy"."StrategyNodeType" NOT NULL,
  "to_type" "strategy"."StrategyNodeType" NOT NULL,
  "edge_type" "strategy"."StrategyEdgeType" NOT NULL,
  "min_count" INTEGER NOT NULL DEFAULT 0,
  "max_count" INTEGER,
  CONSTRAINT "relationship_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "relationship_rules_min_check" CHECK ("min_count" >= 0),
  CONSTRAINT "relationship_rules_max_check" CHECK ("max_count" IS NULL OR "max_count" > 0),
  CONSTRAINT "relationship_rules_range_check" CHECK ("max_count" IS NULL OR "max_count" >= "min_count")
);
CREATE UNIQUE INDEX "relationship_rules_unique" ON "strategy"."relationship_rules"("from_type", "to_type", "edge_type");

CREATE TABLE "strategy"."strategy_edges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "from_node_id" UUID NOT NULL,
  "to_node_id" UUID NOT NULL,
  "edge_type" "strategy"."StrategyEdgeType" NOT NULL,
  "plan_version_id" UUID NOT NULL,
  CONSTRAINT "strategy_edges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strategy_edges_no_self" CHECK ("from_node_id" <> "to_node_id")
);
CREATE UNIQUE INDEX "strategy_edges_unique" ON "strategy"."strategy_edges"("from_node_id", "to_node_id", "edge_type", "plan_version_id");
CREATE INDEX "strategy_edges_from_idx" ON "strategy"."strategy_edges"("from_node_id");
CREATE INDEX "strategy_edges_to_idx" ON "strategy"."strategy_edges"("to_node_id");
CREATE INDEX "strategy_edges_plan_idx" ON "strategy"."strategy_edges"("plan_version_id");

CREATE TABLE "strategy"."owner_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "node_id" UUID NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "assigned_by" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "owner_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "owner_assignments_node_owner_key" ON "strategy"."owner_assignments"("node_id", "owner_user_id");
CREATE INDEX "owner_assignments_owner_idx" ON "strategy"."owner_assignments"("owner_user_id");

-- ApprovalCase is owned by Prompt 1.5. The current repository does not yet expose
-- that table, so approval_case_id is an integration ID rather than a premature FK.
CREATE TABLE "strategy"."staged_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approval_case_id" UUID NOT NULL,
  "plan_version_id" UUID NOT NULL,
  "kind" "strategy"."StagedChangeKind" NOT NULL,
  "target_id" UUID,
  "payload" JSONB NOT NULL,
  "status" "strategy"."StagedChangeStatus" NOT NULL DEFAULT 'pending',
  "requested_by" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMP(3),
  CONSTRAINT "staged_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staged_changes_approval_idx" ON "strategy"."staged_changes"("approval_case_id", "status");
CREATE INDEX "staged_changes_plan_idx" ON "strategy"."staged_changes"("plan_version_id", "status");

ALTER TABLE "strategy"."plan_versions"
  ADD CONSTRAINT "plan_versions_source_fkey" FOREIGN KEY ("source_plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strategy"."strategy_nodes"
  ADD CONSTRAINT "strategy_nodes_plan_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "strategy_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."strategy_edges"
  ADD CONSTRAINT "strategy_edges_from_fkey" FOREIGN KEY ("from_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "strategy_edges_to_fkey" FOREIGN KEY ("to_node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "strategy_edges_plan_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."owner_assignments"
  ADD CONSTRAINT "owner_assignments_node_fkey" FOREIGN KEY ("node_id") REFERENCES "strategy"."strategy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "owner_assignments_owner_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "owner_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy"."staged_changes"
  ADD CONSTRAINT "staged_changes_plan_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "strategy"."plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "staged_changes_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Single authoritative rule set. objective -> strategic_play is represented by
-- executed_by only; an additional aligns_to rule for the same pair is omitted.
INSERT INTO "strategy"."relationship_rules" ("from_type", "to_type", "edge_type", "min_count", "max_count") VALUES
  ('corporate_strategy', 'theme', 'contains', 1, NULL),
  ('theme', 'objective', 'contains', 1, NULL),
  ('objective', 'strategic_play', 'executed_by', 1, NULL),
  ('strategic_play', 'portfolio', 'belongs_to_portfolio', 0, 1),
  ('strategic_play', 'area_of_focus', 'aligns_to', 0, NULL);

CREATE OR REPLACE FUNCTION "strategy"."validate_strategy_edge"()
RETURNS TRIGGER AS $$
DECLARE
  source_type "strategy"."StrategyNodeType";
  target_type "strategy"."StrategyNodeType";
  source_plan UUID;
  target_plan UUID;
  rule_max INTEGER;
  existing_count INTEGER;
  creates_cycle BOOLEAN;
BEGIN
  SELECT "type", "plan_version_id" INTO source_type, source_plan FROM "strategy"."strategy_nodes" WHERE "id" = NEW."from_node_id";
  SELECT "type", "plan_version_id" INTO target_type, target_plan FROM "strategy"."strategy_nodes" WHERE "id" = NEW."to_node_id";

  IF source_plan IS NULL OR target_plan IS NULL OR source_plan <> NEW."plan_version_id" OR target_plan <> NEW."plan_version_id" THEN
    RAISE EXCEPTION 'strategy edge nodes must belong to the same plan version';
  END IF;

  SELECT "max_count" INTO rule_max FROM "strategy"."relationship_rules"
  WHERE "from_type" = source_type AND "to_type" = target_type AND "edge_type" = NEW."edge_type";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid strategy relationship: % -[%]-> %', source_type, NEW."edge_type", target_type;
  END IF;

  IF rule_max IS NOT NULL THEN
    SELECT COUNT(*)::INTEGER INTO existing_count
    FROM "strategy"."strategy_edges" e
    JOIN "strategy"."strategy_nodes" n ON n."id" = e."to_node_id"
    WHERE e."from_node_id" = NEW."from_node_id"
      AND e."edge_type" = NEW."edge_type"
      AND e."plan_version_id" = NEW."plan_version_id"
      AND n."type" = target_type
      AND (TG_OP <> 'UPDATE' OR e."id" <> NEW."id");
    IF existing_count + 1 > rule_max THEN
      RAISE EXCEPTION 'strategy relationship exceeds max_count of %', rule_max;
    END IF;
  END IF;

  -- Recursive CTE cycle check: if source is reachable from target, inserting
  -- source -> target would make source its own ancestor.
  WITH RECURSIVE reachable(node_id) AS (
    SELECT NEW."to_node_id"
    UNION
    SELECT e."to_node_id"
    FROM "strategy"."strategy_edges" e
    JOIN reachable r ON e."from_node_id" = r.node_id
    WHERE e."plan_version_id" = NEW."plan_version_id"
      AND (TG_OP <> 'UPDATE' OR e."id" <> NEW."id")
  )
  SELECT EXISTS(SELECT 1 FROM reachable WHERE node_id = NEW."from_node_id") INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'strategy relationship would create a directed cycle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "strategy_edges_validate_relationship"
BEFORE INSERT OR UPDATE ON "strategy"."strategy_edges"
FOR EACH ROW EXECUTE FUNCTION "strategy"."validate_strategy_edge"();

COMMIT;
