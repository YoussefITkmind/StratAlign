import type { SyncLog as SyncLogRow, Connection as ConnectionRow, SyncLogStatus } from "../../generated/prisma/client";

/**
 * Deterministic half of a sync investigation.
 *
 * Everything the model is later shown is assembled here — collected from the
 * existing `SyncLog`/`Connection` rows, redacted, truncated, and reduced to
 * plain numbers. Nothing in this file calls an LLM, and nothing downstream is
 * allowed to add a field to the prompt that did not pass through here.
 *
 * Two properties matter and are tested directly:
 *
 * 1. Arithmetic (averages, percentage change, sample counts, thresholds) is
 *    computed here, never asked of the model. A model that miscounts is a
 *    wrong diagnosis; a model handed `dropPercent: 58` cannot miscount.
 * 2. The evidence is bounded and redacted. Sync messages are operator-authored
 *    free text that can contain a bearer token or a connection string, so they
 *    are scrubbed and capped before they can reach a third-party API.
 */

/** How many neighbouring log entries for the same integration are collected. */
export const MAX_RELATED_LOGS = 10;
/** How many prior successful volumes feed the historical comparison. */
export const MAX_VOLUME_SAMPLES = 20;
/** Below this, a comparison is noise rather than a baseline. */
export const MIN_VOLUME_SAMPLES = 3;
/** A drop at or beyond this share of the baseline is treated as anomalous. */
export const VOLUME_DROP_THRESHOLD_PERCENT = 30;
/** Per-message cap. Sync errors can embed an entire stack trace or payload. */
export const MAX_MESSAGE_LENGTH = 400;

const FAILURE_STATUSES: ReadonlySet<SyncLogStatus> = new Set<SyncLogStatus>(["FAILED", "PARTIAL"]);

export function isFailureStatus(status: SyncLogStatus): boolean {
  return FAILURE_STATUSES.has(status);
}

/**
 * Patterns for secrets that turn up inside operator-authored sync messages and
 * connection metadata.
 *
 * Deliberately aggressive: over-redacting a diagnosis costs a little accuracy,
 * under-redacting sends a live credential to a model vendor. Each pattern
 * keeps the label (`token=`, `Bearer`) so the model can still tell that an
 * authentication value was involved, which is diagnostically the useful part.
 */
const REDACTION_RULES: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, replacement: "$1 [REDACTED]" },
  { pattern: /\b(basic)\s+[A-Za-z0-9+/=]{8,}/gi, replacement: "$1 [REDACTED]" },
  {
    pattern:
      /\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password|passwd|pwd|authorization|private[_-]?key|session[_-]?id|credential)\b\s*[:=]\s*("[^"]*"|'[^']*'|\S+)/gi,
    replacement: "$1=[REDACTED]",
  },
  // Vendor-shaped standalone keys (Stripe/OpenAI/GitHub/Slack style prefixes).
  { pattern: /\b(?:sk|pk|rk|ghp|gho|ghs|xox[abps])[-_][A-Za-z0-9_-]{12,}\b/g, replacement: "[REDACTED]" },
  // JWTs.
  { pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, replacement: "[REDACTED]" },
  // Credentials embedded in a URL: scheme://user:pass@host
  { pattern: /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s:/@]+@/gi, replacement: "$1[REDACTED]@" },
];

/**
 * Strips credential-shaped substrings, collapses whitespace, and truncates.
 *
 * Applied to every free-text field that leaves the database for the prompt.
 */
export function sanitiseText(value: string, maxLength = MAX_MESSAGE_LENGTH): string {
  const redacted = REDACTION_RULES.reduce(
    (text, rule) => text.replace(rule.pattern, rule.replacement),
    value,
  );
  const collapsed = redacted.replace(/\s+/g, " ").trim();

  return collapsed.length <= maxLength
    ? collapsed
    : `${collapsed.slice(0, maxLength)}… (truncated, ${collapsed.length} characters total)`;
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

/** Every number here is computed in this module, never by the model. */
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

export type InsufficientReason =
  | "NO_ERROR_DETAIL"
  | "NO_HISTORICAL_VOLUME"
  | "TOO_FEW_OBSERVATIONS";

export interface SyncInvestigationEvidence {
  readonly sync: SyncEvidence;
  readonly connection: ConnectionEvidence | null;
  readonly relatedLogs: readonly RelatedLogEvidence[];
  readonly volume: VolumeEvidence | null;
  readonly kind: InvestigationKind;
  readonly hasErrorEvidence: boolean;
  readonly hasVolumeEvidence: boolean;
  /** True when the deterministic checks cannot justify spending an LLM call. */
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

/**
 * Connection facts that describe *how* the integration is wired, never *what
 * it is wired with*. `meta` is the only free-text field and is sanitised like
 * any sync message; no credential column exists on the model, and none is read
 * here even if one is added later.
 */
function toConnectionEvidence(row: ConnectionRow): ConnectionEvidence {
  return {
    name: sanitiseText(row.name, 150),
    category: sanitiseText(row.category, 100),
    status: row.status,
    direction: sanitiseText(row.direction, 100),
    authenticationMethod: sanitiseText(row.meta, 120),
  };
}

/**
 * Compares this run's inbound volume against previous *successful* runs of the
 * same integration.
 *
 * Returns null rather than a zeroed record when there is nothing to compare —
 * "no history" and "history showing no change" are different findings, and the
 * sufficiency check depends on telling them apart.
 */
export function analyseVolume(
  current: SyncLogRow,
  history: readonly SyncLogRow[],
): VolumeEvidence | null {
  if (current.recordsIn === null) {
    return null;
  }

  const previousVolumes = history
    .filter((row) => row.id !== current.id && row.status === "SUCCESS" && row.recordsIn !== null)
    .slice(0, MAX_VOLUME_SAMPLES)
    .map((row) => row.recordsIn as number);

  if (previousVolumes.length === 0) {
    return null;
  }

  const total = previousVolumes.reduce((sum, value) => sum + value, 0);
  const historicalAverage = total / previousVolumes.length;
  const changePercent =
    historicalAverage === 0 ? 0 : ((current.recordsIn - historicalAverage) / historicalAverage) * 100;

  return {
    currentVolume: current.recordsIn,
    historicalAverage: round(historicalAverage),
    historicalMinimum: Math.min(...previousVolumes),
    historicalMaximum: Math.max(...previousVolumes),
    previousVolumes,
    changePercent: round(changePercent),
    sampleCount: previousVolumes.length,
    isAnomalousDrop:
      previousVolumes.length >= MIN_VOLUME_SAMPLES &&
      changePercent <= -VOLUME_DROP_THRESHOLD_PERCENT,
  };
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Assembles the full evidence bundle and decides whether it can support a
 * diagnosis at all.
 *
 * The sufficiency rule is deliberately conservative: a run has to carry either
 * a described failure or a measurable volume anomaly. A `FAILED` row with an
 * empty message, no error count, and no failing neighbours says only "it
 * broke" — enough for a model to invent a plausible cause from, which is
 * exactly the outcome this feature must not produce.
 */
export function buildInvestigationEvidence(input: {
  syncLog: SyncLogRow;
  relatedLogs: readonly SyncLogRow[];
  connection: ConnectionRow | null;
}): SyncInvestigationEvidence {
  const { syncLog, connection } = input;

  const neighbours = input.relatedLogs.filter((row) => row.id !== syncLog.id);
  const relatedLogs = neighbours.slice(0, MAX_RELATED_LOGS).map(toRelatedLogEvidence);
  const volume = analyseVolume(syncLog, neighbours);

  const failed = isFailureStatus(syncLog.status);
  const currentDescribesFailure = hasText(syncLog.message) || syncLog.errorCount > 0;
  const neighbourDescribesFailure = neighbours.some(
    (row) => isFailureStatus(row.status) && (hasText(row.message) || row.errorCount > 0),
  );

  const hasErrorEvidence =
    (failed && currentDescribesFailure) || (failed && neighbourDescribesFailure);
  const hasVolumeEvidence = volume?.isAnomalousDrop === true;

  const insufficientReasons: InsufficientReason[] = [];

  if (failed && !hasErrorEvidence) {
    insufficientReasons.push("NO_ERROR_DETAIL");
  }
  if (!hasVolumeEvidence) {
    if (volume === null) {
      insufficientReasons.push("NO_HISTORICAL_VOLUME");
    } else if (volume.sampleCount < MIN_VOLUME_SAMPLES) {
      insufficientReasons.push("TOO_FEW_OBSERVATIONS");
    }
  }

  const kind: InvestigationKind = hasErrorEvidence
    ? "SYNC_FAILURE"
    : hasVolumeEvidence
      ? "VOLUME_DROP"
      : "NO_ANOMALY";

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
