-- Prompt 2.2: drill-heavy traceability read model.
-- A materialized view is used because traceability is read-heavy and recursive closure
-- is substantially more expensive than indexed lookup. Edge writes remain authoritative;
-- an outbox event is emitted by the edge trigger and the worker refreshes this read model.
-- The closure is capped at ADR-03's maximum depth of 8.

CREATE INDEX IF NOT EXISTS "strategy_edges_from_plan_idx"
  ON "strategy"."strategy_edges" ("from_node_id", "plan_version_id");
CREATE INDEX IF NOT EXISTS "strategy_edges_to_plan_idx"
  ON "strategy"."strategy_edges" ("to_node_id", "plan_version_id");

CREATE MATERIALIZED VIEW "strategy"."traceability_edges" AS
WITH RECURSIVE trace AS (
  SELECT
    e."plan_version_id",
    e."from_node_id" AS "ancestor_id",
    e."to_node_id" AS "descendant_id",
    e."edge_type",
    1::integer AS "depth"
  FROM "strategy"."strategy_edges" e

  UNION ALL

  SELECT
    t."plan_version_id",
    t."ancestor_id",
    e."to_node_id" AS "descendant_id",
    e."edge_type",
    t."depth" + 1
  FROM trace t
  JOIN "strategy"."strategy_edges" e
    ON e."from_node_id" = t."descendant_id"
   AND e."plan_version_id" = t."plan_version_id"
  WHERE t."depth" < 8
)
SELECT DISTINCT
  "plan_version_id",
  "ancestor_id",
  "descendant_id",
  "edge_type",
  "depth"
FROM trace;

CREATE UNIQUE INDEX "traceability_edges_unique_idx"
  ON "strategy"."traceability_edges" ("plan_version_id", "ancestor_id", "descendant_id", "edge_type", "depth");
CREATE INDEX "traceability_edges_ancestor_depth_idx"
  ON "strategy"."traceability_edges" ("ancestor_id", "depth");
CREATE INDEX "traceability_edges_descendant_depth_idx"
  ON "strategy"."traceability_edges" ("descendant_id", "depth");

-- Edge changes publish an atomic outbox event. The consumer refreshes the materialized
-- read model; producers do not refresh synchronously and therefore do not slow writes.
CREATE OR REPLACE FUNCTION "strategy"."publish_strategy_edge_changed"()
RETURNS TRIGGER AS $$
DECLARE
  edge_id UUID;
  plan_id UUID;
BEGIN
  edge_id := COALESCE(NEW."id", OLD."id");
  plan_id := COALESCE(NEW."plan_version_id", OLD."plan_version_id");

  INSERT INTO "public"."domain_events" (
    "id", "event_type", "event_version", "aggregate_type", "aggregate_id",
    "payload", "dedupe_key", "status", "occurred_at", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid()::text,
    'strategy.edge.changed',
    1,
    'strategy_edge',
    edge_id::text,
    jsonb_build_object(
      'domain', 'strategy',
      'edgeId', edge_id,
      'planVersionId', plan_id,
      'operation', lower(TG_OP)
    ),
    'strategy.edge.changed:' || edge_id::text || ':' || lower(TG_OP) || ':' || txid_current()::text,
    'PENDING'::"public"."DomainEventStatus",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "strategy_edges_publish_changed"
AFTER INSERT OR UPDATE OR DELETE ON "strategy"."strategy_edges"
FOR EACH ROW EXECUTE FUNCTION "strategy"."publish_strategy_edge_changed"();
