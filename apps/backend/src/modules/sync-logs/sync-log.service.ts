import type { PrismaService } from "../../database/prisma.service";

import { SyncRunNotFoundError } from "./sync-log.errors";
import { fromSyncRunStatusView, toSyncRunStatusView } from "./sync-log.mappers";
import type {
  ListSyncRunsInput,
  SyncRunDetail,
  SyncRunSummary,
} from "./sync-log.types";

const DEFAULT_HISTORY_LIMIT = 5;

const summarySelect = {
  id: true,
  sourceKey: true,
  sourceName: true,
  status: true,
  startedAt: true,
  completedAt: true,
  recordsProcessed: true,
  recordsCreated: true,
  recordsUpdated: true,
  recordsFailed: true,
  errorCode: true,
  errorMessage: true,
} as const;

function toSummary(row: {
  id: string;
  sourceKey: string;
  sourceName: string;
  status: ReturnType<typeof fromSyncRunStatusView>;
  startedAt: Date;
  completedAt: Date | null;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsUpdated: number | null;
  recordsFailed: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}): SyncRunSummary {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    sourceName: row.sourceName,
    status: toSyncRunStatusView(row.status),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    recordsProcessed: row.recordsProcessed,
    recordsCreated: row.recordsCreated,
    recordsUpdated: row.recordsUpdated,
    recordsFailed: row.recordsFailed,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

/**
 * The minimal Sync Logs domain service: list and read sync attempts.
 *
 * This is deliberately the whole module — no trigger, connector, or schedule
 * management. It also implements `SyncRunReader` (see
 * `sync-investigation.service.ts`), so the AI investigation service reads
 * sync history through the exact same contract this service's own callers
 * use, rather than a parallel query path.
 */
export class SyncLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(input: ListSyncRunsInput): Promise<SyncRunSummary[]> {
    const rows = await this.prisma.syncRun.findMany({
      where: {
        sourceKey: input.sourceKey,
        status: input.status ? fromSyncRunStatusView(input.status) : undefined,
      },
      select: summarySelect,
      orderBy: { startedAt: "desc" },
      take: input.limit,
    });

    return rows.map(toSummary);
  }

  async getById(syncRunId: string): Promise<SyncRunDetail | null> {
    const row = await this.prisma.syncRun.findUnique({
      where: { id: syncRunId },
      select: { ...summarySelect, logExcerpt: true },
    });

    return row ? { ...toSummary(row), logExcerpt: row.logExcerpt } : null;
  }

  /** Throws rather than returning null — every caller of this needs a run to exist. */
  async requireById(syncRunId: string): Promise<SyncRunDetail> {
    const run = await this.getById(syncRunId);

    if (!run) {
      throw new SyncRunNotFoundError();
    }

    return run;
  }

  /**
   * The most recent successful runs for the same source, most recent first,
   * excluding the run under investigation. This is the raw material the
   * investigation service turns into historical-volume evidence — nothing
   * here decides what counts as an anomaly.
   */
  async listRecentSuccessful(
    sourceKey: string,
    excludeId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<SyncRunSummary[]> {
    const rows = await this.prisma.syncRun.findMany({
      where: {
        sourceKey,
        status: "SUCCESS",
        id: { not: excludeId },
      },
      select: summarySelect,
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    return rows.map(toSummary);
  }
}
