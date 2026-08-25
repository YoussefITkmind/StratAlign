ALTER TYPE "scorecard"."map_link_strength" ADD VALUE IF NOT EXISTS 'enables';
ALTER TYPE "scorecard"."map_link_strength" ADD VALUE IF NOT EXISTS 'impacts';
ALTER TYPE "scorecard"."map_link_strength" ADD VALUE IF NOT EXISTS 'drives';
ALTER TYPE "scorecard"."map_link_strength" ADD VALUE IF NOT EXISTS 'supports';

CREATE OR REPLACE FUNCTION "scorecard"."cleanup_strategy_map_objective"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM "scorecard"."map_links"
  WHERE "from_objective_id" = OLD."id"
     OR "to_objective_id" = OLD."id";

  DELETE FROM "scorecard"."placements"
  WHERE "objective_node_id" = OLD."id";

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS "strategy_map_cleanup_before_hierarchy_objective_delete"
ON "strategy_hierarchy"."strategy_hierarchy_nodes";

CREATE TRIGGER "strategy_map_cleanup_before_hierarchy_objective_delete"
BEFORE DELETE ON "strategy_hierarchy"."strategy_hierarchy_nodes"
FOR EACH ROW
WHEN (OLD."type" = 'objective'::"strategy_hierarchy"."StrategyHierarchyNodeType")
EXECUTE FUNCTION "scorecard"."cleanup_strategy_map_objective"();
