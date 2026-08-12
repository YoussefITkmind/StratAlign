BEGIN;

-- GAP-03 / Phase 4.4: Portfolio and Area of Focus are strategy-domain nodes.
-- A play may temporarily be unmapped so the admin workflow can surface it via
-- findUnmappedPlays(); once mapped, a play belongs to at most one Area of Focus.
DELETE FROM strategy.relationship_rules
WHERE (from_type = 'strategic_play' AND to_type = 'portfolio' AND edge_type = 'belongs_to_portfolio')
   OR (from_type = 'strategic_play' AND to_type = 'area_of_focus' AND edge_type = 'aligns_to');

INSERT INTO strategy.relationship_rules (from_type, to_type, edge_type, min_count, max_count)
VALUES
  ('portfolio', 'area_of_focus', 'contains', 0, NULL),
  ('strategic_play', 'area_of_focus', 'belongs_to_portfolio', 0, 1)
ON CONFLICT (from_type, to_type, edge_type)
DO UPDATE SET min_count = EXCLUDED.min_count, max_count = EXCLUDED.max_count;

COMMIT;
