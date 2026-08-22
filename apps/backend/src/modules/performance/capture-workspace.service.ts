import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client as MinioClient } from "minio";
import * as XLSX from "xlsx";
import { getTransformationId, publishConformed, reconcileChecksum, reconcileRowCount, runTransform, runValidation } from "@spm/ingest";
import type { PrismaService } from "../../database/prisma.service";
import { ingestMeasurementsWithin } from "./measurement-ingest.repository";

const allowedEvidence = new Set(["application/pdf", "image/png", "image/jpeg", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
export type ValidatedRow = { row: number; period: string; value: number | null; outcome: "accepted" | "rejected" | "warning"; reason?: string };
export interface ObjectStorageConfiguration {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

export class CaptureWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly objectStorage: ObjectStorageConfiguration,
  ) {}

  async listTasks(ownerId: string) {
    const sessions = await this.prisma.captureSession.findMany({ where: { ownerId }, orderBy: { updatedAt: "desc" } });
    const versions = await this.prisma.kpiVersion.findMany({ where: { ownerUserId: ownerId }, include: { kpiDefinition: true } });
    const byVersion = new Map(sessions.map((session) => [`${session.kpiVersionId}:${session.period}`, session]));
    const cadences = await this.prisma.cadenceInstance.findMany({
      where: { cadenceDefinition: { subjectType: "performance_kpi", subjectId: { in: versions.map((v) => v.id) } } },
      include: { cadenceDefinition: true }, orderBy: { windowClosesAt: "asc" },
    });
    return cadences.map((instance) => {
      const version = versions.find((candidate) => candidate.id === instance.cadenceDefinition.subjectId)!;
      const payload = instance.payloadSnapshot as Record<string, unknown>;
      const scopeNodeId = String(payload.scopeNodeId ?? "");
      const period = instance.periodKey ?? String(payload.period ?? instance.sequence);
      return { id: instance.id, kpiVersionId: version.id, kpiName: version.nameEn, unit: version.unit, scopeNodeId, period, dueAt: instance.windowClosesAt, cadenceState: instance.status, session: byVersion.get(`${version.id}:${period}`) ?? null };
    }).filter((task) => task.scopeNodeId.length > 0);
  }

  async getSession(sessionId: string) {
    return this.prisma.captureSession.findUnique({ where: { id: sessionId } });
  }

  async saveDraft(sessionId: string, ownerId: string, value: number, evidenceRef?: string | null) {
    return this.prisma.captureSession.update({ where: { id: sessionId, ownerId, state: "DRAFT" }, data: { draftValue: value, ...(evidenceRef === undefined ? {} : { draftEvidenceRef: evidenceRef }) } });
  }

  async history(kpiVersionId: string, scopeNodeId: string) {
    const rows = await this.prisma.measurement.findMany({ where: { kpiVersionId, scopeNodeId }, orderBy: { createdAt: "desc" }, take: 12 });
    return rows.map((row) => ({ ...row, value: Number(row.value), submittedBy: row.submittedById }));
  }

  template(format: "csv" | "xlsx", period: string, priorValue: number | null): Buffer {
    const rows = [{ period, value: priorValue ?? "" }];
    if (format === "csv") return Buffer.from(XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)));
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Capture");
    return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
  }

  /** @deprecated Bespoke Prompt 2.8 validation was removed; this is now an adapter over packages/ingest. */
  async validateTemplate(bytes: Buffer, format: "csv" | "xlsx", expectedPeriod: string, history: number[], sessionId?: string, ownerId?: string): Promise<ValidatedRow[]> {
    const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return [{ row: 1, period: "", value: null, outcome: "rejected", reason: "Workbook is empty" }];
    const sourceRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const runId = randomUUID();
    const date = new Date().toISOString().slice(0, 10);
    const rawPrefix = `raw/manual-template/${date}/${runId}`;
    const csv = Buffer.from(XLSX.utils.sheet_to_csv(sheet));
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const manifest = Buffer.from(JSON.stringify({ source: "manual-template", extractionTs: new Date().toISOString(), rowCount: sourceRows.length, files: [{ path: `capture.${format}`, rowCount: sourceRows.length, checksum }] }));
    const client = this.storageClient();
    await client.putObject(this.objectStorage.bucket, `${rawPrefix}/capture.${format}`, bytes, bytes.length, { "Content-Type": format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await client.putObject(this.objectStorage.bucket, `${rawPrefix}/manifest.json`, manifest, manifest.length, { "Content-Type": "application/json" });
    const directory = await mkdtemp(join(tmpdir(), "capture-template-"));
    const csvPath = join(directory, "capture.csv");
    const rawPath = join(directory, `capture.${format}`);
    await writeFile(csvPath, csv);
    await writeFile(rawPath, bytes);
    const mean = history.length ? history.reduce((a, b) => a + b, 0) / history.length : null;
    const sd = mean === null || history.length < 2 ? 0 : Math.sqrt(history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length);
    const validation = await runValidation(join(process.cwd(), "../../packages/ingest/transforms/manual-template/capture-validation.sql"), { raw_csv: csvPath, expected_period: expectedPeriod, mean: mean ?? 0, sd });
    const checksumControl = await reconcileChecksum({ runId, filePath: rawPath, expectedChecksum: checksum });
    if (!checksumControl.passed) return [{ row: 1, period: "", value: null, outcome: "rejected", reason: "Raw file checksum does not match manifest" }];
    const report = validation.details.map((row) => ({ row: Number(row.row_number), period: String(row.period), value: row.value === null ? null : Number(row.value), outcome: String(row.outcome) as ValidatedRow["outcome"], ...(row.reason ? { reason: String(row.reason) } : {}) }));
    if (validation.passed && (sessionId || ownerId)) {
      const session = sessionId ? await this.prisma.captureSession.findUniqueOrThrow({ where: { id: sessionId } }) : await this.prisma.captureSession.findFirstOrThrow({ where: { ownerId: ownerId!, period: expectedPeriod, state: "DRAFT" }, orderBy: { updatedAt: "desc" } });
      const parquet = join(directory, "measurements.parquet");
      const transform = join(process.cwd(), "../../packages/ingest/transforms/manual-template/capture-to-measurement.sql");
      await runTransform(transform, { raw_csv: csvPath, conformed_parquet: parquet, kpi_version_id: session.kpiVersionId, scope_node_id: session.scopeNodeId, submitted_by: session.ownerId });
      const rowCount = await reconcileRowCount({ runId, datasetPath: parquet, expectedRowCount: sourceRows.length });
      const transformationId = await getTransformationId(transform);
      await publishConformed({ datasetPath: parquet, targetTable: "Measurement", reconciliationResults: [rowCount, checksumControl], salamAssigneeId: "salam-bi-data-contact", database: this.prisma as never, ingest: (tx, rows) => ingestMeasurementsWithin(tx as never, rows as never), lineageBatch: sourceRows.map(() => ({ sourceSystem: "manual-template", sourceObject: `capture.${format}`, sourceField: "value", extractionTs: new Date(), transformationId, runId, checksum })) });
      // Publication already happened through the shared publisher. Clearing the
      // values preserves the report while suppressing Prompt 2.8's legacy
      // "Commit validated row" button, preventing a second MANUAL write.
      for (const row of report) row.value = null;
    }
    return report;
  }

  private storageClient() { const endpoint = new URL(this.objectStorage.endpoint); return new MinioClient({ endPoint: endpoint.hostname, port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80, useSSL: endpoint.protocol === "https:", accessKey: this.objectStorage.accessKey, secretKey: this.objectStorage.secretKey }); }

  async uploadEvidence(sessionId: string, fileName: string, contentType: string, bytes: Buffer) {
    if (!allowedEvidence.has(contentType)) throw new Error("Evidence file type is not allowed");
    const client = this.storageClient();
    const key = `evidence/${sessionId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await client.putObject(this.objectStorage.bucket, key, bytes, bytes.length, { "Content-Type": contentType });
    await client.statObject(this.objectStorage.bucket, key);
    return `minio://${this.objectStorage.bucket}/${key}`;
  }
}
