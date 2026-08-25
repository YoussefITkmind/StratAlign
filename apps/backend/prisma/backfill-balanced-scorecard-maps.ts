import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const url = new URL(connectionString);
url.searchParams.delete("schema");
const client = new pg.Client({ connectionString: url.toString() });

type ScorecardRow = {
  id: string;
  planVersionId: string;
  strategicObjective: string | null;
  primaryPerspective: string | null;
  status: string;
  score: number;
  ownerName: string;
  ownerInitials: string | null;
  description: string | null;
};

type PerspectiveRow = {
  id: string;
  key: string | null;
  ownerColor: string | null;
};

function objectiveStatus(status: string) {
  if (status === "on-track") return "on-track";
  if (status === "at-risk") return "at-risk";
  return "not-started";
}

async function refreshObjectiveFromKpis(objectiveNodeId: string) {
  const stats = await client.query<{
    count: number;
    averageScore: number | null;
    atRisk: number;
    draft: number;
  }>(`
    SELECT
      COUNT(k.id)::int AS count,
      AVG(k.score)::float8 AS "averageScore",
      COUNT(*) FILTER (WHERE k.status = 'at-risk')::int AS "atRisk",
      COUNT(*) FILTER (WHERE k.status = 'draft')::int AS draft
    FROM scorecard.objective_kpi_links l
    JOIN scorecard.kpi_snapshots k ON k.id = l.kpi_snapshot_id
    WHERE l.objective_node_id = $1::uuid
  `, [objectiveNodeId]);

  const row = stats.rows[0];
  if (!row || row.count === 0) return;
  const status = row.atRisk > 0
    ? "at-risk"
    : row.draft === row.count
      ? "not-started"
      : row.draft > 0
        ? "at-risk"
        : "on-track";

  await client.query(`
    UPDATE scorecard.objective_profiles
    SET status = $2,
        progress = $3,
        updated_at = NOW()
    WHERE objective_node_id = $1::uuid
  `, [objectiveNodeId, status, Math.max(0, Math.min(100, row.averageScore ?? 0))]);
}

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");

    const actor = await client.query<{ id: string }>(`
      SELECT id FROM iam.users ORDER BY created_at, id LIMIT 1
    `);
    const actorUserId = actor.rows[0]?.id;
    if (!actorUserId) throw new Error("At least one IAM user is required to backfill scorecard maps");

    const scorecards = await client.query<ScorecardRow>(`
      SELECT
        s.id,
        s.plan_version_id AS "planVersionId",
        p.strategic_objective AS "strategicObjective",
        p.primary_perspective AS "primaryPerspective",
        p.status,
        p.score::float8 AS score,
        p.owner_name AS "ownerName",
        p.owner_initials AS "ownerInitials",
        p.description
      FROM scorecard.scorecards s
      JOIN scorecard.balanced_scorecard_profiles p ON p.scorecard_id = s.id
      ORDER BY s.created_at, s.id
    `);

    let createdMaps = 0;
    let createdObjectives = 0;

    for (const scorecard of scorecards.rows) {
      const existingPublishedMap = await client.query<{ id: string }>(`
        SELECT id
        FROM scorecard.strategy_maps
        WHERE scorecard_id = $1::uuid AND state = 'published'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `, [scorecard.id]);

      if (existingPublishedMap.rowCount === 0) {
        await client.query(`
          INSERT INTO scorecard.strategy_maps (scorecard_id, state)
          VALUES ($1::uuid, 'published')
        `, [scorecard.id]);
        createdMaps += 1;
      }

      if (!scorecard.strategicObjective?.trim()) continue;

      const existingObjective = await client.query<{ id: string }>(`
        SELECT objective_node_id AS id
        FROM scorecard.objective_profiles
        WHERE scorecard_id = $1::uuid
        ORDER BY created_at, objective_node_id
        LIMIT 1
      `, [scorecard.id]);
      if ((existingObjective.rowCount ?? 0) > 0) continue;

      const perspectives = await client.query<PerspectiveRow>(`
        SELECT
          p.id,
          bp.perspective_key AS key,
          bp.owner_color AS "ownerColor"
        FROM scorecard.perspectives p
        LEFT JOIN scorecard.balanced_perspective_profiles bp ON bp.perspective_id = p.id
        WHERE p.scorecard_id = $1::uuid
        ORDER BY p."order", p.id
      `, [scorecard.id]);

      const target = perspectives.rows.find((row) => row.key === scorecard.primaryPerspective)
        ?? perspectives.rows[0];
      if (!target) continue;

      const objective = await client.query<{ id: string }>(`
        INSERT INTO strategy.strategy_nodes (
          type, name_en, name_ar, plan_version_id, state, created_by
        ) VALUES (
          'objective', $1, $1, $2::uuid, 'active', $3
        )
        RETURNING id
      `, [scorecard.strategicObjective.trim(), scorecard.planVersionId, actorUserId]);
      const objectiveNodeId = objective.rows[0]!.id;

      await client.query(`
        INSERT INTO scorecard.placements (perspective_id, objective_node_id)
        VALUES ($1::uuid, $2::uuid)
      `, [target.id, objectiveNodeId]);

      await client.query(`
        INSERT INTO scorecard.objective_profiles (
          objective_node_id, scorecard_id, status, progress,
          owner_name, owner_initials, owner_color, description
        ) VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8
        )
      `, [
        objectiveNodeId,
        scorecard.id,
        objectiveStatus(scorecard.status),
        Math.max(0, Math.min(100, scorecard.score)),
        scorecard.ownerName,
        scorecard.ownerInitials,
        target.ownerColor,
        scorecard.description,
      ]);

      await client.query(`
        INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id)
        SELECT $1::uuid, k.id
        FROM scorecard.kpi_snapshots k
        WHERE k.perspective_id = $2::uuid
        ON CONFLICT DO NOTHING
      `, [objectiveNodeId, target.id]);

      await refreshObjectiveFromKpis(objectiveNodeId);
      createdObjectives += 1;
    }

    await client.query("COMMIT");
    console.log(
      `Balanced Scorecard map backfill complete: ${scorecards.rowCount ?? 0} scorecards, ${createdMaps} maps created, ${createdObjectives} objectives materialized`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Balanced Scorecard map backfill failed", error);
  process.exitCode = 1;
});
