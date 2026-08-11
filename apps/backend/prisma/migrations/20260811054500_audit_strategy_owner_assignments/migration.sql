-- Prompt 2.1: owner assignments participate in Phase 1.3's temporal snapshot pattern.
-- Keeping this as a database trigger makes the audit record atomic with inserts/updates
-- regardless of which application entry point performs the assignment.

CREATE OR REPLACE FUNCTION "strategy"."snapshot_owner_assignment"()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
  snapshot_time TIMESTAMP(3);
BEGIN
  snapshot_time := COALESCE(NEW."assigned_at", CURRENT_TIMESTAMP);

  PERFORM pg_advisory_xact_lock(hashtext('strategy_owner_assignment:' || NEW."id"::text));

  SELECT COALESCE(MAX("version"), 0) + 1
    INTO next_version
    FROM "audit"."entity_snapshots"
   WHERE "aggregate_type" = 'strategy_owner_assignment'
     AND "aggregate_id" = NEW."id"::text;

  UPDATE "audit"."entity_snapshots"
     SET "valid_to" = snapshot_time
   WHERE "aggregate_type" = 'strategy_owner_assignment'
     AND "aggregate_id" = NEW."id"::text
     AND "valid_to" IS NULL;

  INSERT INTO "audit"."entity_snapshots" (
    "id", "aggregate_type", "aggregate_id", "version", "snapshot_data",
    "valid_from", "valid_to", "created_at"
  ) VALUES (
    gen_random_uuid(),
    'strategy_owner_assignment',
    NEW."id"::text,
    next_version,
    jsonb_build_object(
      'id', NEW."id",
      'nodeId', NEW."node_id",
      'ownerUserId', NEW."owner_user_id",
      'assignedBy', NEW."assigned_by",
      'assignedAt', NEW."assigned_at"
    ),
    snapshot_time,
    NULL,
    CURRENT_TIMESTAMP
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "owner_assignments_snapshot_audit"
AFTER INSERT OR UPDATE ON "strategy"."owner_assignments"
FOR EACH ROW EXECUTE FUNCTION "strategy"."snapshot_owner_assignment"();
