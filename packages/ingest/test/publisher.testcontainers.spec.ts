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
      CREATE TABLE integration.reconciliation_results (run_id uuid, control_type text, source_value text, platform_value text, delta numeric, passed boolean, checked_at timestamptz, detail text);
      CREATE TABLE integration.quality_flags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject_type text, subject_ref text, rule text, severity text, detail text, state text, raised_by_run_id uuid);
      CREATE TABLE integration.remediation_items (quality_flag_id uuid, description text, assigned_to text, due_date timestamptz, state text);
      CREATE TABLE public.domain_events (event_type text, event_version int, aggregate_type text, aggregate_id text, dedupe_key text, occurred_at timestamptz, payload jsonb);
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
      reconciliationResult: { createMany: async ({ data }: { data: any[] }) => { for (const row of data) await client.query(`INSERT INTO integration.reconciliation_results VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [row.runId,row.controlType,row.sourceValue,row.platformValue,row.delta,row.passed,row.checkedAt,row.detail ?? null]); } },
      qualityFlag: { create: async ({ data }: { data: any }) => (await client.query(`INSERT INTO integration.quality_flags (subject_type,subject_ref,rule,severity,detail,state,raised_by_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [data.subjectType,data.subjectRef,data.rule,data.severity,data.detail,data.state,data.raisedByRunId])).rows[0] },
      remediationItem: { create: async ({ data }: { data: any }) => client.query(`INSERT INTO integration.remediation_items VALUES ($1,$2,$3,$4,$5)`, [data.qualityFlagId,data.description,data.assignedTo,data.dueDate,data.state]) },
      domainEvent: { create: async ({ data }: { data: any }) => client.query(`INSERT INTO public.domain_events VALUES ($1,$2,$3,$4,$5,$6,$7)`, [data.eventType,data.eventVersion,data.aggregateType,data.aggregateId,data.dedupeKey,data.occurredAt,JSON.stringify(data.payload)]) },
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
      [row.kpi_version_id, row.scope_node_id, row.period, String(row.value), row.submitted_by],
    );
    return { id: result.rows[0].id as string };
  }));

  const lineage = (checksum: string) => [{ sourceSystem: "generic", sourceObject: "actuals.csv", sourceField: "value", extractionTs: new Date(), transformationId: "transform-v1", runId: "00000000-0000-0000-0000-000000000301", checksum }];

  it("rolls back both facts and lineage when lineage fails", async () => {
    await expect(publishConformed({ datasetPath: parquet, targetTable: "Measurement", lineageBatch: lineage("invalid"), database, ingest, reconciliationResults: [{ runId: "00000000-0000-0000-0000-000000000301", controlType: "row_count", sourceValue: "1", platformValue: "1", delta: 0, passed: true, checkedAt: new Date() }], salamAssigneeId: "salam-bi-lead" })).rejects.toThrow();
    expect((await pool.query("SELECT count(*)::int AS count FROM performance.measurements")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS count FROM integration.lineage_records")).rows[0].count).toBe(0);
  });

  it("publishes CSV-derived Measurement and lineage as TEMPLATE", async () => {
    await publishConformed({ datasetPath: parquet, targetTable: "Measurement", lineageBatch: lineage("a".repeat(64)), database, ingest, reconciliationResults: [{ runId: "00000000-0000-0000-0000-000000000301", controlType: "row_count", sourceValue: "1", platformValue: "1", delta: 0, passed: true, checkedAt: new Date() }], salamAssigneeId: "salam-bi-lead" });
    expect((await pool.query("SELECT value::float8 AS value, source FROM performance.measurements")).rows).toEqual([{ value: 42.5, source: "template" }]);
    expect((await pool.query("SELECT source_system FROM integration.lineage_records")).rows).toEqual([{ source_system: "generic" }]);
  });

  it("blocks failed reconciliation, creates remediation, and routes BI/Data Lead notification", async () => {
    await pool.query("TRUNCATE performance.measurements, integration.lineage_records, integration.quality_flags, integration.remediation_items, public.domain_events");
    const ids = await publishConformed({ datasetPath: parquet, targetTable: "Measurement", lineageBatch: lineage("a".repeat(64)), database, ingest, reconciliationResults: [{ runId: "00000000-0000-0000-0000-000000000302", controlType: "sum_by_dimension", sourceValue: "99", platformValue: "42.5", delta: -56.5, passed: false, checkedAt: new Date(), detail: "sector=retail" }], salamAssigneeId: "salam-bi-lead" });
    expect(ids).toEqual([]);
    expect((await pool.query("SELECT count(*)::int count FROM performance.measurements")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT count(*)::int count FROM integration.lineage_records")).rows[0].count).toBe(0);
    expect((await pool.query("SELECT rule,state FROM integration.quality_flags")).rows).toEqual([{ rule: "reconciliation", state: "open" }]);
    expect((await pool.query("SELECT assigned_to FROM integration.remediation_items")).rows).toEqual([{ assigned_to: "salam-bi-lead" }]);
    expect((await pool.query("SELECT payload->>'recipientRole' role FROM public.domain_events")).rows).toEqual([{ role: "bi_data_lead" }]);
  });
});
