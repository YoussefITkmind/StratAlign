import { DuckDBInstance } from "@duckdb/node-api";
import type { LineageInput, ReconciliationResult } from "./types";

export interface PublishTransaction {
  lineageRecord: { createMany(args: { data: LineageInput[] }): Promise<unknown> };
  reconciliationResult: { createMany(args: { data: ReconciliationResult[] }): Promise<unknown> };
  qualityFlag: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  remediationItem: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  domainEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}
export interface TransactionHost { $transaction<T>(work: (tx: PublishTransaction) => Promise<T>): Promise<T> }
export type DomainIngest = (tx: PublishTransaction, rows: Record<string, unknown>[]) => Promise<Array<{ id: string }>>;

export async function publishConformed(input: {
  datasetPath: string;
  targetTable: string;
  lineageBatch: Omit<LineageInput, "figureRef">[];
  database: TransactionHost;
  ingest: DomainIngest;
  reconciliationResults: ReconciliationResult[];
  salamAssigneeId: string;
}): Promise<string[]> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  let rows: Record<string, unknown>[];
  try {
    const escaped = input.datasetPath.replaceAll("'", "''");
    rows = (await connection.runAndReadAll(`SELECT * FROM read_parquet('${escaped}')`)).getRowObjects() as Record<string, unknown>[];
  } finally { connection.closeSync(); }
  if (rows.length !== input.lineageBatch.length) throw new Error("Every conformed row must have lineage");
  const failed = input.reconciliationResults.filter((control) => !control.passed);
  if (input.reconciliationResults.length === 0) throw new Error("Publication requires reconciliation results");
  if (failed.length > 0) {
    await input.database.$transaction(async (tx) => {
      await tx.reconciliationResult.createMany({ data: input.reconciliationResults });
      const flag = await tx.qualityFlag.create({ data: { subjectType: "source", subjectRef: failed[0]!.runId, rule: "reconciliation", severity: "high", detail: failed.map((item) => `${item.controlType}: ${item.detail ?? item.delta}`).join("; "), state: "open", raisedByRunId: failed[0]!.runId } });
      await tx.remediationItem.create({ data: { qualityFlagId: flag.id, description: "Correct source data or manifest and rerun ingestion", assignedTo: input.salamAssigneeId, dueDate: new Date(Date.now() + 3 * 86_400_000), state: "open" } });
      await tx.domainEvent.create({ data: { eventType: "integration.reconciliation.failed", eventVersion: 1, aggregateType: "integration_run", aggregateId: failed[0]!.runId, dedupeKey: `integration.reconciliation.failed:${failed[0]!.runId}`, occurredAt: new Date(), payload: { runId: failed[0]!.runId, recipientRole: "bi_data_lead", failedControls: failed.map((item) => item.controlType) } } });
    });
    return [];
  }
  return input.database.$transaction(async (tx) => {
    await tx.reconciliationResult.createMany({ data: input.reconciliationResults });
    const facts = await input.ingest(tx, rows);
    if (facts.length !== rows.length) throw new Error(`${input.targetTable} ingest did not return one fact per row`);
    await tx.lineageRecord.createMany({ data: facts.map((fact, index) => ({ ...input.lineageBatch[index]!, figureRef: fact.id })) });
    return facts.map((fact) => fact.id);
  });
}
