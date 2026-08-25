import "dotenv/config";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const url = new URL(connectionString);
url.searchParams.delete("schema");
const client = new pg.Client({ connectionString: url.toString() });

const TEMPORARY_NAMES = [
  "Corporate Strategy 2025",
  "Product Strategy 2025",
  "APAC Expansion Strategy",
];

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");

    const candidates = await client.query<{ id: string; name: string }>(`
      SELECT s.id, s.name_en AS name
      FROM scorecard.scorecards s
      LEFT JOIN scorecard.balanced_scorecard_profiles bp ON bp.scorecard_id = s.id
      WHERE s.name_en = ANY($1::text[])
        AND bp.scorecard_id IS NULL
    `, [TEMPORARY_NAMES]);

    if (candidates.rowCount === 0) {
      await client.query("COMMIT");
      console.log("Temporary Strategy Map cleanup: nothing to remove");
      return;
    }

    const ids = candidates.rows.map((row) => row.id);
    const objectiveRows = await client.query<{ id: string }>(`
      SELECT DISTINCT pl.objective_node_id AS id
      FROM scorecard.placements pl
      JOIN scorecard.perspectives p ON p.id = pl.perspective_id
      WHERE p.scorecard_id = ANY($1::uuid[])
    `, [ids]);
    const objectiveIds = objectiveRows.rows.map((row) => row.id);

    await client.query(`DELETE FROM scorecard.scorecards WHERE id = ANY($1::uuid[])`, [ids]);

    if (objectiveIds.length > 0) {
      await client.query(`
        UPDATE strategy.strategy_nodes n
        SET state = 'retired'
        WHERE n.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM scorecard.placements pl WHERE pl.objective_node_id = n.id)
          AND NOT EXISTS (SELECT 1 FROM scorecard.objective_profiles op WHERE op.objective_node_id = n.id)
      `, [objectiveIds]);
    }

    await client.query("COMMIT");
    console.log(`Temporary Strategy Map cleanup: removed ${candidates.rowCount} map-only scorecards`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Temporary Strategy Map cleanup failed", error);
  process.exitCode = 1;
});
