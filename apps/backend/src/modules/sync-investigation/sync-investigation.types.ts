import type { SyncRunDetail, SyncRunSummary } from "../sync-logs/sync-log.types";
import type { VolumeAnomalyEvidence } from "./volume-anomaly";

/**
 * The stable read contract the AI investigation service depends on.
 *
 * Deliberately not a dependency on `SyncLogService` the class: any future
 * source of sync data — the eventual full Data & Integrations module
 * included — can drive investigation by implementing this interface, the
 * same way `ThemeContextBuilder` depends on `ThemeTraversalReader` rather
 * than on `StrategyTraversalService` directly.
 */
export interface SyncRunReader {
  getById(syncRunId: string): Promise<SyncRunDetail | null>;
  listRecentSuccessful(
    sourceKey: string,
    excludeId: string,
    limit?: number,
  ): Promise<SyncRunSummary[]>;
}

/** Everything the model is told about one sync run. Assembled server-side —
 * nothing here originates in the browser. */
export interface SyncInvestigationContext {
  syncRun: SyncRunDetail;
  volumeAnomaly: VolumeAnomalyEvidence;
}

export interface SyncInvestigationResult {
  syncRunId: string;
  diagnosis: string;
  /** Null whenever `insufficientData` is true — the model must not name a
   * cause it was not able to support. */
  likelyCause: string | null;
  recommendedNextSteps: string[];
  /** 0-1 model self-estimate. Never a correctness guarantee. */
  confidence: number;
  insufficientData: boolean;
  evidence: string[];
  provider: string;
  model: string;
  latencyMs: number;
}
