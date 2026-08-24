import type { PrismaService } from "../../database/prisma.service";
import type { SyncLog as SyncLogRow, SyncLogStatus } from "../../generated/prisma/client";

export interface SyncLogView {
  id: string;
  integration: string;
  started: string;
  duration: string;
  status: SyncLogStatus;
  recordsIn: number | null;
  recordsOut: number | null;
  errors: number;
  message: string;
  color: string;
  icon: string;
  createdAt: Date;
}

function toView(row: SyncLogRow): SyncLogView {
  return {
    id: row.id,
    integration: row.integrationName,
    started: row.startedLabel,
    duration: row.durationLabel,
    status: row.status,
    recordsIn: row.recordsIn,
    recordsOut: row.recordsOut,
    errors: row.errorCount,
    message: row.message,
    color: row.color,
    icon: row.icon,
    createdAt: row.createdAt,
  };
}

export class SyncLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SyncLogView[]> {
    const rows = await this.prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    return rows.map(toView);
  }
}
