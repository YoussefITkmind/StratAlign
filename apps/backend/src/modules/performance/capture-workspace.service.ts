import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";
import * as XLSX from "xlsx";
import type { PrismaService } from "../../database/prisma.service";

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

  validateTemplate(bytes: Buffer, format: "csv" | "xlsx", expectedPeriod: string, history: number[]): ValidatedRow[] {
    const workbook = XLSX.read(bytes, { type: "buffer", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) return [{ row: 1, period: "", value: null, outcome: "rejected", reason: "Workbook is empty" }];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const mean = history.length ? history.reduce((a, b) => a + b, 0) / history.length : null;
    const sd = mean === null || history.length < 2 ? 0 : Math.sqrt(history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length);
    return rows.map((raw, index) => {
      const period = String(raw.period ?? "").trim(); const value = Number(raw.value);
      if (!period || raw.value === "" || !Number.isFinite(value)) return { row: index + 2, period, value: null, outcome: "rejected", reason: "period and numeric value are required" };
      if (period !== expectedPeriod) return { row: index + 2, period, value, outcome: "rejected", reason: `Expected period ${expectedPeriod}` };
      if (mean !== null && sd > 0 && Math.abs(value - mean) > 3 * sd) return { row: index + 2, period, value, outcome: "warning", reason: "Value exceeds 3 standard deviations from trailing history" };
      return { row: index + 2, period, value, outcome: "accepted" };
    });
  }

  async uploadEvidence(sessionId: string, fileName: string, contentType: string, bytes: Buffer) {
    if (!allowedEvidence.has(contentType)) throw new Error("Evidence file type is not allowed");
    const endpoint = new URL(this.objectStorage.endpoint);
    const client = new MinioClient({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === "https:" ? 443 : 80,
      useSSL: endpoint.protocol === "https:",
      accessKey: this.objectStorage.accessKey,
      secretKey: this.objectStorage.secretKey,
    });
    const key = `evidence/${sessionId}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await client.putObject(this.objectStorage.bucket, key, bytes, bytes.length, { "Content-Type": contentType });
    await client.statObject(this.objectStorage.bucket, key);
    return `minio://${this.objectStorage.bucket}/${key}`;
  }
}
