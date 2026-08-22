-- New Strategy Hierarchy schema/tables (see prisma/schema.prisma). This is
-- purely additive: a new schema, two new enum types, and two new tables with
-- their indexes and foreign keys.

CREATE SCHEMA IF NOT EXISTS "strategy_hierarchy";

CREATE TYPE "strategy_hierarchy"."StrategyHierarchyNodeType" AS ENUM ('plan', 'perspective', 'objective', 'initiative', 'project');

CREATE TYPE "strategy_hierarchy"."StrategyHierarchyNodeStatus" AS ENUM ('on-track', 'at-risk', 'off-track', 'not-started');

CREATE TABLE "strategy_hierarchy"."strategy_hierarchy_nodes" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "name" TEXT NOT NULL,
    "type" "strategy_hierarchy"."StrategyHierarchyNodeType" NOT NULL,
    "status" "strategy_hierarchy"."StrategyHierarchyNodeStatus" NOT NULL DEFAULT 'not-started',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "owner_name" TEXT NOT NULL,
    "owner_initials" TEXT NOT NULL,
    "owner_color" TEXT NOT NULL,
    "budget" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "description" TEXT,
    "linked_kpis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_hierarchy_nodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategy_hierarchy"."strategy_hierarchy_activity" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_hierarchy_activity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "strategy_hierarchy_nodes_parent_id_idx" ON "strategy_hierarchy"."strategy_hierarchy_nodes"("parent_id");

CREATE INDEX "strategy_hierarchy_activity_node_id_created_at_idx" ON "strategy_hierarchy"."strategy_hierarchy_activity"("node_id", "created_at");

ALTER TABLE "strategy_hierarchy"."strategy_hierarchy_nodes" ADD CONSTRAINT "strategy_hierarchy_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "strategy_hierarchy"."strategy_hierarchy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "strategy_hierarchy"."strategy_hierarchy_nodes" ADD CONSTRAINT "strategy_hierarchy_nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "iam"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "strategy_hierarchy"."strategy_hierarchy_activity" ADD CONSTRAINT "strategy_hierarchy_activity_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "strategy_hierarchy"."strategy_hierarchy_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
