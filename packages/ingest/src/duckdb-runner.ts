import { readFile } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import type { SqlParams, ValidationResult } from "./types";

function interpolate(sql: string, params: SqlParams): string {
  return sql.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, (_, name: string) => {
    if (!(name in params)) throw new Error(`Missing SQL parameter: ${name}`);
    const value = params[name];
    if (value instanceof Date) return `'${value.toISOString().replaceAll("'", "''")}'`;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return `'${String(value).replaceAll("'", "''")}'`;
  });
}

async function execute(sqlFilePath: string, params: SqlParams) {
  const sql = interpolate(await readFile(sqlFilePath, "utf8"), params);
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    if (/\b(?:s3|https?):\/\//i.test(sql)) await connection.run("INSTALL httpfs; LOAD httpfs;");
    return await connection.runAndReadAll(sql);
  } finally { connection.closeSync(); }
}

export async function runTransform(sqlFilePath: string, params: SqlParams): Promise<void> {
  await execute(sqlFilePath, params);
}

export async function runValidation(sqlFilePath: string, params: SqlParams): Promise<ValidationResult> {
  const result = await execute(sqlFilePath, params);
  const rows = result.getRowObjects() as Record<string, unknown>[];
  return { passed: rows.every((row) => row.passed === true), details: rows };
}
