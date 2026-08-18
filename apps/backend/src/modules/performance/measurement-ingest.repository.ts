import type { Prisma } from "../../generated/prisma/client";

export interface MeasurementIngestRow {
  kpi_version_id: string;
  scope_node_id: string;
  period: string;
  value: number | string;
  source: "TEMPLATE";
  submitted_by: string;
  evidence_ref?: string | null;
}

/** Domain-owned write boundary used by packages/ingest. */
export async function ingestMeasurementsWithin(
  tx: Prisma.TransactionClient,
  rows: readonly MeasurementIngestRow[],
): Promise<Array<{ id: string }>> {
  const created: Array<{ id: string }> = [];
  for (const row of rows) {
    if (row.source !== "TEMPLATE") throw new Error("Generic ingestion must be classified as TEMPLATE");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`performance.measurement:${row.kpi_version_id}:${row.scope_node_id}:${row.period}`}))`;
    const current = await tx.measurement.findFirst({
      where: { kpiVersionId: row.kpi_version_id, scopeNodeId: row.scope_node_id, period: row.period, supersededBy: null },
    });
    const measurement = await tx.measurement.create({
      data: {
        kpiVersionId: row.kpi_version_id,
        scopeNodeId: row.scope_node_id,
        period: row.period,
        value: row.value,
        source: "TEMPLATE",
        submittedById: row.submitted_by,
        evidenceRef: row.evidence_ref ?? null,
        supersedesId: current?.id ?? null,
      },
      select: { id: true },
    });
    created.push(measurement);
  }
  return created;
}
