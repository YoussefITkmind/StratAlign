import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import type { ReconciliationResult } from "./types";

const identifier = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};
const pathLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;
const result = (runId: string, controlType: ReconciliationResult["controlType"], source: number | string, platform: number | string, passed: boolean, detail?: string): ReconciliationResult => ({ runId, controlType, sourceValue: String(source), platformValue: String(platform), delta: Number(platform) - Number(source) || 0, passed, checkedAt: new Date(), detail });

async function scalar(datasetPath: string, expression: string, where = "TRUE"): Promise<number> {
  const db = await DuckDBInstance.create(":memory:"); const connection = await db.connect();
  try { const rows = (await connection.runAndReadAll(`SELECT ${expression} AS value FROM read_parquet(${pathLiteral(datasetPath)}) WHERE ${where}`)).getRowObjects() as Array<{ value: number | bigint }>;
    return Number(rows[0]?.value ?? 0); } finally { connection.closeSync(); }
}

export async function reconcileRowCount(input: { runId: string; datasetPath: string; expectedRowCount: number }): Promise<ReconciliationResult> {
  const actual = await scalar(input.datasetPath, "count(*)");
  return result(input.runId, "row_count", input.expectedRowCount, actual, actual === input.expectedRowCount);
}

export async function reconcileSumByDimension(input: { runId: string; datasetPath: string; dimensionColumn: string; dimensionValue: string; valueColumn: string; expectedTotal: number; tolerance?: number }): Promise<ReconciliationResult> {
  const actual = await scalar(input.datasetPath, `coalesce(sum(${identifier(input.valueColumn)}), 0)`, `${identifier(input.dimensionColumn)} = ${pathLiteral(input.dimensionValue)}`);
  const tolerance = input.tolerance ?? 0.000001;
  return result(input.runId, "sum_by_dimension", input.expectedTotal, actual, Math.abs(actual - input.expectedTotal) <= tolerance, `${input.dimensionColumn}=${input.dimensionValue}`);
}

export async function reconcileChecksum(input: { runId: string; filePath: string; expectedChecksum: string }): Promise<ReconciliationResult> {
  const actual = createHash("sha256").update(await readFile(input.filePath)).digest("hex");
  return result(input.runId, "checksum", input.expectedChecksum, actual, actual.toLowerCase() === input.expectedChecksum.toLowerCase(), input.filePath);
}
