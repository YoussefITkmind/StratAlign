import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishConformed, runTransform } from "../src";

describe("generic CSV publisher (Testcontainers)", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let pool: Pool;
  let parquet: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    await pool.query(`
      CREATE SCHEMA performance; CREATE SCHEMA integration;
      CREATE TABLE performance.measurements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kpi_version_id text NOT NULL,
        scope_node_id uuid NOT NULL, period text NOT NULL, value numeric(20,6) NOT NULL,
        source text NOT NULL CHECK (source IN ('template','feed','manual')), submitted_by uuid NOT NULL
      );
      CREATE TABLE integration.lineage_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), figure_ref text NOT NULL,
        source_system text NOT NULL, source_object text NOT NULL, source_field text NOT NULL,
        extraction_ts timestamptz NOT NULL, transformation_id text NOT NULL, run_id uuid NOT NULL,
        checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$')
      );
    `);
    const directory = await mkdtemp(join(tmpdir(), "spm-ingest-e2e-"));
    const csv = join(directory, "actuals.csv");
    parquet = join(directory, "actuals.parquet");
    await writeFile(csv, "kpi_version_id,scope_node_id,period,value,submitted_by,source_object,source_field\nkpi-v1,00000000-0000-0000-0000-000000000101,2026-07,42.5,00000000-0000-0000-0000-000000000201,actuals.csv,value\n");
    await runTransform(join(import.meta.dirname, "../transforms/generic/kpi-actuals.sql"), { raw_csv: csv, conformed_parquet: parquet });
  }, 120_000);

  afterAll(async () => { await pool?.end(); await container?.stop(); });

  const database = {
    async $transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(transaction(client));
        await client.query("COMMIT");
        return result;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
  };

  function transaction(client: PoolClient) {
    return {
      client,
      lineageRecord: { createMany: async ({ data }: { data: any[] }) => {
        for (const row of data) await client.query(
          `INSERT INTO integration.lineage_records (figure_ref,source_system,source_object,source_field,extraction_ts,transformation_id,run_id,checksum) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.figureRef,row.sourceSystem,row.sourceObject,row.sourceField,row.extractionTs,row.transformationId,row.runId,row.checksum],
        );
      } },
    };
  }

  const ingest = async (tx: any, rows: Record<string, unknown>[]) => Promise.all(rows.map(async (row) => {
    const result = await tx.client.query(
      `INSERT INTO performance.measurements (kpi_version_id,scope_node_id,period,value,source,submitted_by) VALUES ($1,$2,$3,$4,'template',$5) RETURNING id`,
      [row.kpi_version_id,row.scope_node_id,row.period,row.value,row.submitted_by],
    );
    return { id: result.rows[0].id as string };
  }));

  const lineage = (checksum: string) => [{ sourceSystem: "generic", sourceObject: "actuals.csv", sourceField: "value", extractionTs: new Date(), transformationId: "transform-v1", runId: "00000000-0000-0000-0000-000000000301", checksum }];

  it("rolls back both facts and lineage when lineage fails", async () => {
    await expect(publishConformed({ datasetPath: parquet, targetTable: "Measurement", lineageBatch: lineage("invalid"), database, ingest })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM performance.measurements")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM integration.lineage_records")).rows[0].count).toBe(0);
  });

  it("publishes CSV-derived Measurement and lineage as TEMPLATE", async () => {
    await publishConformed({ datasetPath: parquet, targetTable: "Measurement", lineageBatch: lineage("a".repeat(64)), database, ingest });
    expect((await pool.query("SELECT value::float8 AS value, source FROM performance.measurements")).rows).toEqual([{ value: 42.5, source: "template" }]);
    expect((await pool.query("SELECT source_system FROM integration.lineage_records")).rows).toEqual([{ source_system: "generic" }]);
  });
});
