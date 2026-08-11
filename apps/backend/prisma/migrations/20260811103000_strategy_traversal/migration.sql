-- Prompt 2.2: traceability read model.
-- We deliberately use a normal view instead of a materialized view. The strategy graph
-- is small enough for indexed recursive reads, while a view is transactionally current
-- after every edge mutation and cannot become stale between an outbox event and refresh.
-- The recursive closure is defensively capped at ADR-03's maximum depth of 8.

CREATE INDEX IF NOT EXISTS "strategy_edges_from_plan_idx"
  ON "strategy"."strategy_edges" ("from_node_id", "plan_version_id");
CREATE INDEX IF NOT EXISTS "strategy_edges_to_plan_idx"
  ON "strategy"."strategy_edges" ("to_node_id", "plan_version_id");

CREATE OR REPLACE VIEW "strategy"."traceability_edges" AS
WITH RECURSIVE trace AS (
  SELECT
    e."plan_version_id",
    e."from_node_id" AS "ancestor_id",
    e."to_node_id" AS "descendant_id",
    e."edge_type",
    1::integer AS "depth",
    ARRAY[e."from_node_id", e."to_node_id"]::uuid[] AS "path"
  FROM "strategy"."strategy_edges" e

  UNION ALL

  SELECT
    t."plan_version_id",
    t."ancestor_id",
    e."to_node_id" AS "descendant_id",
    e."edge_type",
    t."depth" + 1,
    t."path" || e."to_node_id"
  FROM trace t
  JOIN "strategy"."strategy_edges" e
    ON e."from_node_id" = t."descendant_id"
   AND e."plan_version_id" = t."plan_version_id"
  WHERE t."depth" < 8
    AND NOT e."to_node_id" = ANY(t."path")
)
SELECT DISTINCT
  "plan_version_id",
  "ancestor_id",
  "descendant_id",
  "edge_type",
  "depth"
FROM trace;
