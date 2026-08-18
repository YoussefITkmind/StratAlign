import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { describe, expect, it } from "vitest";
import { reconcileChecksum, reconcileRowCount, reconcileSumByDimension } from "../src";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "reconcile-"));
  const raw = join(directory, "actuals.csv"); const parquet = join(directory, "actuals.parquet");
  const content = "sector,value\nretail,10\nretail,15\nenterprise,20\n";
  await writeFile(raw, content);
  const db = await DuckDBInstance.create(":memory:"); const connection = await db.connect();
  await connection.run(`COPY (SELECT * FROM read_csv_auto('${raw.replaceAll("'", "''")}')) TO '${parquet.replaceAll("'", "''")}' (FORMAT PARQUET)`); connection.closeSync();
  return { raw, parquet, checksum: createHash("sha256").update(content).digest("hex") };
}

describe("reconciliation controls", () => {
  it("row count passes and fails", async () => { const f = await fixture(); expect((await reconcileRowCount({ runId: "run", datasetPath: f.parquet, expectedRowCount: 3 })).passed).toBe(true); expect((await reconcileRowCount({ runId: "run", datasetPath: f.parquet, expectedRowCount: 4 })).passed).toBe(false); });
  it("sum by dimension passes and fails", async () => { const f = await fixture(); expect((await reconcileSumByDimension({ runId: "run", datasetPath: f.parquet, dimensionColumn: "sector", dimensionValue: "retail", valueColumn: "value", expectedTotal: 25 })).passed).toBe(true); expect((await reconcileSumByDimension({ runId: "run", datasetPath: f.parquet, dimensionColumn: "sector", dimensionValue: "retail", valueColumn: "value", expectedTotal: 26 })).passed).toBe(false); });
  it("checksum passes and fails", async () => { const f = await fixture(); expect((await reconcileChecksum({ runId: "run", filePath: f.raw, expectedChecksum: f.checksum })).passed).toBe(true); expect((await reconcileChecksum({ runId: "run", filePath: f.raw, expectedChecksum: "0".repeat(64) })).passed).toBe(false); });
});
