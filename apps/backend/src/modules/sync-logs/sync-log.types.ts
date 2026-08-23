/**
 * The stable application-level contract for a sync attempt.
 *
 * This is the seam the AI investigation service depends on (via
 * `SyncRunReader` in `sync-investigation.service.ts`) and the seam a future,
 * full Data & Integrations module must keep satisfying if it replaces this
 * scaffold's persistence with something richer — the investigation service
 * never sees a Prisma row, a UI prop, or an integration-management concept.
 */

export type SyncRunStatusView = "success" | "failed" | "partial" | "running";

export interface SyncRunSummary {
  id: string;
  sourceKey: string;
  sourceName: string;
  status: SyncRunStatusView;
  startedAt: Date;
  completedAt: Date | null;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsUpdated: number | null;
  recordsFailed: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SyncRunDetail extends SyncRunSummary {
  logExcerpt: string | null;
}

export interface ListSyncRunsInput {
  sourceKey?: string;
  status?: SyncRunStatusView;
  limit: number;
}
