import { DuckDBInstance } from "@duckdb/node-api";
import type { LineageInput } from "./types";

export interface PublishTransaction {
  lineageRecord: { createMany(args: { data: LineageInput[] }): Promise<unknown> };
}
export interface TransactionHost { $transaction<T>(work: (tx: PublishTransaction) => Promise<T>): Promise<T> }
export type DomainIngest = (tx: PublishTransaction, rows: Record<string, unknown>[]) => Promise<Array<{ id: string }>>;

export async function publishConformed(input: {
  datasetPath: string;
  targetTable: string;
  lineageBatch: Omit<LineageInput, "figureRef">[];
  database: TransactionHost;
  ingest: DomainIngest;
}): Promise<string[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  let rows: Record<string, unknown>[];
  try {
    const escaped = input.datasetPath.replaceAll("'", "''");
    rows = (await connection.runAndReadAll(`SELECT * FROM read_parquet('${escaped}')`)).getRowObjects() as Record<string, unknown>[];
  } finally { connection.closeSync(); }
  if (rows.length !== input.lineageBatch.length) throw new Error("Every conformed row must have lineage");
  return input.database.$transaction(async (tx) => {
    const facts = await input.ingest(tx, rows);
    if (facts.length !== rows.length) throw new Error(`${input.targetTable} ingest did not return one fact per row`);
    await tx.lineageRecord.createMany({ data: facts.map((fact, index) => ({ ...input.lineageBatch[index]!, figureRef: fact.id })) });
    return facts.map((fact) => fact.id);
  });
}
