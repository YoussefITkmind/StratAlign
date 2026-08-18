import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import { runTransform } from "../src";

describe("manual template transform", () => {
  it("reshapes wide periods into long-form Measurement inputs", async () => {
    const output = join(await mkdtemp(join(tmpdir(), "wide-template-")), "measurements.parquet");
    await runTransform(join(import.meta.dirname, "../transforms/manual-template/wide-to-measurements.sql"), { raw_csv: join(import.meta.dirname, "fixtures/raw/wide-kpi-template.csv"), conformed_parquet: output });
    const db = await DuckDBInstance.create(":memory:"); const connection = await db.connect();
    const rows = (await connection.runAndReadAll(`SELECT period, CAST(value AS INTEGER) AS measurement_value FROM read_parquet('${output.replaceAll("'", "''")}') ORDER BY period, measurement_value`)).getRowObjects(); connection.closeSync();
    expect(rows).toEqual([{ period: "2026-Q1", measurement_value: 10 }, { period: "2026-Q1", measurement_value: 20 }, { period: "2026-Q2", measurement_value: 12 }, { period: "2026-Q2", measurement_value: 22 }]);
  });
});
