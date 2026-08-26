import type { SyncLog as SyncLogRow, Connection as ConnectionRow, SyncLogStatus } from "../../generated/prisma/client";

export const MAX_RELATED_LOGS = 10;
export const MAX_VOLUME_SAMPLES = 20;
export const MIN_VOLUME_SAMPLES = 3;
export const VOLUME_DROP_THRESHOLD_PERCENT = 30;
export const MAX_MESSAGE_LENGTH = 400;

const FAILURE_STATUSES: ReadonlySet<SyncLogStatus> = new Set<SyncLogStatus>(["FAILED", "PARTIAL"]);

export function isFailureStatus(status: SyncLogStatus): boolean {
  return FAILURE_STATUSES.has(status);
}

const REDACTION_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: "$1 [REDACTED]" },
  { pattern: /\b(basic)\s+[A-Za-z0-9+/=]{8,}/gi, replacement: "$1 [REDACTED]" },
  {
    pattern: /\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password|passwd|pwd|authorization|private[_-]?key|session[_-]?id|credential)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi,
    replacement: "$1=[REDACTED]",
  },
  { pattern: /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abps])[-_][A-Za-z0-9_-]{12,}\b/g, replacement: "[REDACTED]" },
  { pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, replacement: "[REDACTED]" },
  { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s:/@]+@/gi, replacement: "$1[REDACTED]@" },
];

export function sanitiseText(value: string, maxLength = MAX_MESSAGE_LENGTH): string {
  const redacted = REDACTION_RULES.reduce((text, rule) => text.replace(rule.pattern, rule.replacement), value);
  const collapsed = redacted.replace(/\s+/g, " ").trim();
  return collapsed.length <= maxLength ? collapsed : `${collapsed.slice(0, maxLength)}… (truncated, ${collapsed.length} characters total)`;
}

export interface SyncEvidence {
  readonly syncLogId: string;
  readonly integration: string;
  readonly status: SyncLogStatus;
  readonly started: string;
  readonly duration: string;
  readonly recordsIn: number | null;
  readonly recordsOut: number | null;
  readonly errorCount: number;
  readonly message: string;
}

export interface RelatedLogEvidence {
  readonly status: SyncLogStatus;
  readonly started: string;
  readonly duration: string;
  readonly recordsIn: number | null;
  readonly errorCount: number;
  readonly message: string;
}

export interface ConnectionEvidence {
  readonly name: string;
  readonly category: string;
  readonly status: string;
  readonly direction: string;
  readonly authenticationMethod: string;
}

export interface VolumeEvidence {
  readonly currentVolume: number;
  readonly historicalAverage: number;
  readonly historicalMinimum: number;
  readonly historicalMaximum: number;
  readonly previousVolumes: readonly number[];
  readonly changePercent: number;
  readonly sampleCount: number;
  readonly isAnomalousDrop: boolean;
}

export type InvestigationKind = "SYNC_FAILURE" | "VOLUME_DROP" | "NO_ANOMALY";
export type InsufficientReason = "NO_ERROR_DETAIL" | "NO_HISTORICAL_VOLUME" | "TOO_FEW_OBSERVATIONS";

export interface SyncInvestigationEvidence {
  readonly sync: SyncEvidence;
  readonly connection: ConnectionEvidence | null;
  readonly relatedLogs: readonly RelatedLogEvidence[];
  readonly volume: VolumeEvidence | null;
  readonly kind: InvestigationKind;
  readonly hasErrorEvidence: boolean;
  readonly hasVolumeEvidence: boolean;
  readonly isSufficient: boolean;
  readonly insufficientReasons: readonly InsufficientReason[];
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toSyncEvidence(row: SyncLogRow): SyncEvidence {
  return {
    syncLogId: row.id,
    integration: sanitiseText(row.integrationName, 150),
    status: row.status,
    started: sanitiseText(row.startedLabel, 100),
    duration: sanitiseText(row.durationLabel, 100),
    recordsIn: row.recordsIn,
    recordsOut: row.recordsOut,
    errorCount: row.errorCount,
    message: sanitiseText(row.message),
  };
}

function toRelatedLogEvidence(row: SyncLogRow): RelatedLogEvidence {
  return {
    status: row.status,
    started: sanitiseText(row.startedLabel, 100),
    duration: sanitiseText(row.durationLabel, 100),
    recordsIn: row.recordsIn,
    errorCount: row.errorCount,
    message: sanitiseText(row.message),
  };
}

function toConnectionEvidence(row: ConnectionRow): ConnectionEvidence {
  return {
    name: sanitiseText(row.name, 150),
    category: sanitiseText(row.category, 100),
    status: row.status,
    direction: sanitiseText(row.direction, 100),
    authenticationMethod: sanitiseText(row.meta, 120),
  };
}

export function analyseVolume(current: SyncLogRow, history: readonly SyncLogRow[]): VolumeEvidence | null {
  if (current.recordsIn === null) return null;

  const previousVolumes = history
    .filter((row) => row.id !== current.id && row.status === "SUCCESS" && row.recordsIn !== null)
    .slice(0, MAX_VOLUME_SAMPLES)
    .map((row) => row.recordsIn as number);

  if (previousVolumes.length === 0) return null;

  const total = previousVolumes.reduce((sum, value) => sum + value, 0);
  const historicalAverage = total / previousVolumes.length;
  const changePercent = historicalAverage === 0 ? 0 : ((current.recordsIn - historicalAverage) / historicalAverage) * 100;

  return {
    currentVolume: current.recordsIn,
    historicalAverage: round(historicalAverage),
    historicalMinimum: Math.min(...previousVolumes),
    historicalMaximum: Math.max(...previousVolumes),
    previousVolumes,
    changePercent: round(changePercent),
    sampleCount: previousVolumes.length,
    isAnomalousDrop: previousVolumes.length >= MIN_VOLUME_SAMPLES && changePercent <= -VOLUME_DROP_THRESHOLD_PERCENT,
  };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export function buildInvestigationEvidence(input: { syncLog: SyncLogRow; relatedLogs: readonly SyncLogRow[]; connection: ConnectionRow | null }): SyncInvestigationEvidence {
  const { syncLog, connection } = input;
  const neighbours = input.relatedLogs.filter((row) => row.id !== syncLog.id);
  const relatedLogs = neighbours.slice(0, MAX_RELATED_LOGS).map(toRelatedLogEvidence);
  const volume = analyseVolume(syncLog, neighbours);

  const failed = isFailureStatus(syncLog.status);
  const currentDescribesFailure = hasText(syncLog.message) || syncLog.errorCount > 0;
  const neighbourDescribesFailure = neighbours.some((row) => isFailureStatus(row.status) && (hasText(row.message) || row.errorCount > 0));
  const hasErrorEvidence = (failed && currentDescribesFailure) || (failed && neighbourDescribesFailure);
  const hasVolumeEvidence = volume?.isAnomalousDrop === true;

  const insufficientReasons: InsufficientReason[] = [];
  if (failed && !hasErrorEvidence) insufficientReasons.push("NO_ERROR_DETAIL");
  if (!hasVolumeEvidence) {
    if (volume === null) insufficientReasons.push("NO_HISTORICAL_VOLUME");
    else if (volume.sampleCount < MIN_VOLUME_SAMPLES) insufficientReasons.push("TOO_FEW_OBSERVATIONS");
  }

  const kind: InvestigationKind = hasErrorEvidence ? "SYNC_FAILURE" : hasVolumeEvidence ? "VOLUME_DROP" : "NO_ANOMALY";

  return {
    sync: toSyncEvidence(syncLog),
    connection: connection ? toConnectionEvidence(connection) : null,
    relatedLogs,
    volume,
    kind,
    hasErrorEvidence,
    hasVolumeEvidence,
    isSufficient: hasErrorEvidence || hasVolumeEvidence,
    insufficientReasons,
  };
}
