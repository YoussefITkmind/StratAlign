import type {
  BriefInitiativeSnapshot,
  BriefKpiSnapshot,
  BriefOkrSnapshot,
  BriefSignal,
  BriefSignalSeverity,
  BriefSnapshot,
} from "./audio-brief.types";

/**
 * Deterministic significance selection for the Executive Audio Brief.
 *
 * Nothing here is asynchronous, nothing here reads configuration, and nothing
 * here calls a model: given the same snapshot it always returns the same
 * signals in the same order. That matters for two reasons. It keeps the prompt
 * small and bounded — the dashboard is never handed to the LLM wholesale, only
 * the handful of items that cleared a threshold — and it makes "which items
 * are significant?" a question with a testable answer that does not depend on
 * a paid call.
 */

/** Hard ceiling on how many items may reach the model. */
export const MAX_BRIEF_SIGNALS = 8;

/**
 * Ceiling on good news. An executive brief that spends half its length on
 * achievements is not a brief about what needs attention, so positives are
 * capped independently of the overall limit.
 */
export const MAX_POSITIVE_SIGNALS = 3;

/** A move against the KPI's own polarity this large is worth reporting. */
const SIGNIFICANT_CHANGE_PERCENT = 10;

/** A gap to target this large is worth reporting even at a healthy status. */
const SIGNIFICANT_DEVIATION_PERCENT = 10;

/** Below this, an objective is treated as being in trouble. */
const LOW_OKR_PROGRESS_PERCENT = 40;

/** Below this, an objective is treated as falling behind. */
const BEHIND_OKR_PROGRESS_PERCENT = 70;

/** At or above this, an objective is a meaningful achievement. */
const STRONG_OKR_PROGRESS_PERCENT = 90;

const SEVERITY_RANK: Record<BriefSignalSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatValue(value: number, unit: string): string {
  const rounded = Number.isInteger(value) ? String(value) : roundToOneDecimal(value).toFixed(1);
  return unit === "%" ? `${rounded}%` : `${rounded} ${unit}`.trim();
}

/**
 * Percentage change relative to `from`. Null when the baseline is zero or
 * missing, because a relative change from zero is not a meaningful number and
 * reporting it as "infinite growth" would be an invented fact.
 */
function percentChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) {
    return null;
  }
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * True when a movement runs against what the KPI wants. A lower_is_better KPI
 * going up is adverse; a higher_is_better KPI going up is not.
 */
function isAdverse(polarity: BriefKpiSnapshot["polarity"], delta: number): boolean {
  return polarity === "higher_is_better" ? delta < 0 : delta > 0;
}

function kpiSignal(kpi: BriefKpiSnapshot): BriefSignal | null {
  const deviation = percentChange(kpi.target, kpi.actual);
  const change = percentChange(kpi.previous, kpi.actual);

  const adverseDeviation =
    deviation !== null && kpi.actual !== null && kpi.target !== null && isAdverse(kpi.polarity, kpi.actual - kpi.target)
      ? Math.abs(deviation)
      : 0;
  const adverseChange =
    change !== null && kpi.actual !== null && kpi.previous !== null && isAdverse(kpi.polarity, kpi.actual - kpi.previous)
      ? Math.abs(change)
      : 0;
  const favourableChange =
    change !== null && kpi.actual !== null && kpi.previous !== null && !isAdverse(kpi.polarity, kpi.actual - kpi.previous)
      ? Math.abs(change)
      : 0;

  const detail = [
    kpi.actual === null ? null : `actual ${formatValue(kpi.actual, kpi.unit)}`,
    kpi.target === null ? null : `target ${formatValue(kpi.target, kpi.unit)}`,
    change === null ? null : `${change >= 0 ? "up" : "down"} ${roundToOneDecimal(Math.abs(change))}% versus the prior period`,
    kpi.period === null ? null : `period ${kpi.period}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  if (kpi.status === "off_track") {
    return {
      kind: "kpi",
      id: kpi.id,
      name: kpi.name,
      severity: "critical",
      // Deviation raises urgency within the off-track group; it never lifts a
      // lesser status into it, which is why it is added rather than compared.
      score: 100 + Math.min(adverseDeviation, 50),
      headline: "KPI is off track",
      detail,
    };
  }

  if (kpi.status === "watch") {
    return {
      kind: "kpi",
      id: kpi.id,
      name: kpi.name,
      severity: "warning",
      score: 70 + Math.min(adverseDeviation, 30),
      headline: "KPI is at risk",
      detail,
    };
  }

  if (adverseChange >= SIGNIFICANT_CHANGE_PERCENT) {
    return {
      kind: "kpi",
      id: kpi.id,
      name: kpi.name,
      severity: "warning",
      score: 50 + Math.min(adverseChange, 30),
      headline: "KPI moved significantly in the wrong direction",
      detail,
    };
  }

  if (adverseDeviation >= SIGNIFICANT_DEVIATION_PERCENT) {
    return {
      kind: "kpi",
      id: kpi.id,
      name: kpi.name,
      severity: "warning",
      score: 45 + Math.min(adverseDeviation, 30),
      headline: "KPI is below its target",
      detail,
    };
  }

  if (favourableChange >= SIGNIFICANT_CHANGE_PERCENT) {
    return {
      kind: "kpi",
      id: kpi.id,
      name: kpi.name,
      severity: "positive",
      score: 30 + Math.min(favourableChange, 30),
      headline: "KPI improved significantly",
      detail,
    };
  }

  return null;
}

function okrSignal(okr: BriefOkrSnapshot): BriefSignal | null {
  if (okr.progressPercent === null) {
    return null;
  }

  const progress = roundToOneDecimal(okr.progressPercent);
  const detail = `progress ${progress}% across ${okr.keyResultCount} key result${okr.keyResultCount === 1 ? "" : "s"}`;

  if (progress < LOW_OKR_PROGRESS_PERCENT) {
    return {
      kind: "okr",
      id: okr.id,
      name: okr.name,
      severity: "critical",
      score: 90 + (LOW_OKR_PROGRESS_PERCENT - progress),
      headline: "Objective has low progress",
      detail,
    };
  }

  if (progress < BEHIND_OKR_PROGRESS_PERCENT) {
    return {
      kind: "okr",
      id: okr.id,
      name: okr.name,
      severity: "warning",
      score: 55 + (BEHIND_OKR_PROGRESS_PERCENT - progress) / 2,
      headline: "Objective is falling behind",
      detail,
    };
  }

  if (progress >= STRONG_OKR_PROGRESS_PERCENT) {
    return {
      kind: "okr",
      id: okr.id,
      name: okr.name,
      severity: "positive",
      score: 30 + (progress - STRONG_OKR_PROGRESS_PERCENT),
      headline: "Objective is close to complete",
      detail,
    };
  }

  return null;
}

function initiativeSignal(initiative: BriefInitiativeSnapshot): BriefSignal | null {
  // Low confidence sharpens an already-flagged initiative. It is not a signal
  // on its own: a confident-but-unrated initiative has told us nothing.
  const lowConfidenceBoost = initiative.confidence === "low" ? 10 : 0;
  const detail = [
    `stage ${initiative.stage}`,
    initiative.confidence === null ? null : `confidence ${initiative.confidence}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  if (initiative.status === "off_track") {
    return {
      kind: "initiative",
      id: initiative.id,
      name: initiative.name,
      severity: "critical",
      score: 95 + lowConfidenceBoost,
      headline: "Initiative is off track",
      detail,
    };
  }

  if (initiative.status === "at_risk") {
    return {
      kind: "initiative",
      id: initiative.id,
      name: initiative.name,
      severity: "warning",
      score: 65 + lowConfidenceBoost,
      headline: "Initiative is at risk",
      detail,
    };
  }

  return null;
}

/**
 * Orders signals so the brief opens with what is most wrong.
 *
 * Ties break on id so the result is stable across runs with identical data —
 * without that, `Array.prototype.sort` stability would still leave the order
 * dependent on the order the domain services happened to return rows in.
 */
function rankSignals(signals: readonly BriefSignal[]): BriefSignal[] {
  return [...signals].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

export function selectKpiSignals(kpis: readonly BriefKpiSnapshot[]): BriefSignal[] {
  return kpis.map(kpiSignal).filter((signal): signal is BriefSignal => signal !== null);
}

export function selectOkrSignals(okrs: readonly BriefOkrSnapshot[]): BriefSignal[] {
  return okrs.map(okrSignal).filter((signal): signal is BriefSignal => signal !== null);
}

export function selectInitiativeSignals(
  initiatives: readonly BriefInitiativeSnapshot[],
): BriefSignal[] {
  return initiatives
    .map(initiativeSignal)
    .filter((signal): signal is BriefSignal => signal !== null);
}

/**
 * The whole selection pipeline: every candidate signal, ranked, with positives
 * capped and the total bounded. This is the only function the service calls.
 */
export function selectSignificantSignals(snapshot: BriefSnapshot): BriefSignal[] {
  const ranked = rankSignals([
    ...selectKpiSignals(snapshot.kpis),
    ...selectOkrSignals(snapshot.okrs),
    ...selectInitiativeSignals(snapshot.initiatives),
  ]);

  const selected: BriefSignal[] = [];
  let positives = 0;

  for (const signal of ranked) {
    if (selected.length >= MAX_BRIEF_SIGNALS) break;
    if (signal.severity === "positive") {
      if (positives >= MAX_POSITIVE_SIGNALS) continue;
      positives += 1;
    }
    selected.push(signal);
  }

  return selected;
}
