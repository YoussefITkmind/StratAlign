import type {
  AudioBriefItem,
  AudioBriefSignals,
  InitiativeSignal,
  KpiSignal,
  OkrSignal,
} from "./audio-brief.types";

/**
 * Deterministic significance selection for the Executive Audio Brief.
 *
 * This runs entirely before any LLM call. The model never sees raw KPI/OKR/
 * initiative data — only the small, bounded list this module selects — so
 * "which few things matter" is ordinary business logic, testable without a
 * provider, and cannot be steered by a prompt.
 *
 * Status vocabulary is reused verbatim from the owning domains: KPI status
 * ("on_track" / "watch" / "off_track") from Performance, initiative status
 * ("on_track" / "at_risk" / "off_track") from Execution. No new status is
 * invented here.
 */

/** A KPI actual this far below target (in the unfavourable direction) is a large enough move to call out on its own. */
const LARGE_CHANGE_PERCENT = 15;
/** A KPI beating its target by at least this margin (in the favourable direction) is worth a positive mention. */
const POSITIVE_MARGIN_PERCENT = 10;
/** Below this, a key result's progress is a significant problem, not just behind. */
const OKR_PROGRESS_PROBLEM_PERCENT = 40;
/** At or above this, a key result is a positive achievement worth naming. */
const OKR_ACHIEVEMENT_PERCENT = 90;

export const MAX_BRIEF_ITEMS = 8;
const MAX_POSITIVE_ITEMS = 2;

interface Candidate {
  readonly item: AudioBriefItem;
  /** Sort key within the same importance tier; larger sorts first. */
  readonly magnitude: number;
}

function percentDelta(actual: number, reference: number): number | null {
  if (reference === 0) {
    return null;
  }
  return ((actual - reference) / Math.abs(reference)) * 100;
}

/** True when moving from `from` to `to` is unfavourable for this KPI's polarity. */
function isUnfavourable(
  from: number,
  to: number,
  polarity: KpiSignal["polarity"],
): boolean {
  return polarity === "higher_is_better" ? to < from : to > from;
}

function kpiCandidates(kpis: readonly KpiSignal[]): Candidate[] {
  const candidates: Candidate[] = [];

  for (const kpi of kpis) {
    if (kpi.status === "off_track" || kpi.status === "watch") {
      const targetGap =
        kpi.target === null ? null : percentDelta(kpi.actual, kpi.target);
      const reason =
        targetGap === null
          ? `${kpi.nameEn} is currently ${kpi.status === "off_track" ? "off track" : "at watch status"}.`
          : `${kpi.nameEn} is ${Math.abs(Math.round(targetGap))}% ${targetGap < 0 ? "below" : "above"} target and ${kpi.status === "off_track" ? "off track" : "at watch status"}.`;

      candidates.push({
        item: {
          type: "kpi",
          name: kpi.nameEn,
          importance: kpi.status === "off_track" ? "critical" : "medium",
          reason,
        },
        magnitude:
          (kpi.status === "off_track" ? 1_000 : 0) + Math.abs(targetGap ?? 0),
      });
      continue;
    }

    if (kpi.delta !== null) {
      const priorValue = kpi.actual - kpi.delta;
      const changePercent = percentDelta(kpi.actual, priorValue);

      if (
        changePercent !== null &&
        isUnfavourable(priorValue, kpi.actual, kpi.polarity) &&
        Math.abs(changePercent) >= LARGE_CHANGE_PERCENT
      ) {
        candidates.push({
          item: {
            type: "kpi",
            name: kpi.nameEn,
            importance: "medium",
            reason: `${kpi.nameEn} moved ${Math.abs(Math.round(changePercent))}% in the wrong direction since the last period.`,
          },
          magnitude: Math.abs(changePercent),
        });
        continue;
      }
    }

    if (
      kpi.target !== null &&
      !isUnfavourable(kpi.target, kpi.actual, kpi.polarity)
    ) {
      const margin = percentDelta(kpi.actual, kpi.target);
      if (margin !== null && Math.abs(margin) >= POSITIVE_MARGIN_PERCENT) {
        candidates.push({
          item: {
            type: "kpi",
            name: kpi.nameEn,
            importance: "positive",
            reason: `${kpi.nameEn} is ${Math.abs(Math.round(margin))}% ahead of target.`,
          },
          magnitude: Math.abs(margin),
        });
      }
    }
  }

  return candidates;
}

function okrCandidates(okrs: readonly OkrSignal[]): Candidate[] {
  const candidates: Candidate[] = [];

  for (const okr of okrs) {
    for (const keyResult of okr.keyResults) {
      if (keyResult.progressPercent === null) {
        continue;
      }

      if (keyResult.progressPercent < OKR_PROGRESS_PROBLEM_PERCENT) {
        candidates.push({
          item: {
            type: "okr",
            name: okr.nameEn,
            importance: "critical",
            reason: `${okr.nameEn} is showing significant progress problems (${Math.round(keyResult.progressPercent)}% on "${keyResult.titleEn}").`,
          },
          magnitude: OKR_PROGRESS_PROBLEM_PERCENT - keyResult.progressPercent,
        });
        continue;
      }

      if (keyResult.progressPercent >= OKR_ACHIEVEMENT_PERCENT) {
        candidates.push({
          item: {
            type: "okr",
            name: okr.nameEn,
            importance: "positive",
            reason: `${okr.nameEn} is nearly complete (${Math.round(keyResult.progressPercent)}% on "${keyResult.titleEn}").`,
          },
          magnitude: keyResult.progressPercent,
        });
      }
    }
  }

  return candidates;
}

function initiativeCandidates(
  initiatives: readonly InitiativeSignal[],
): Candidate[] {
  return initiatives
    .filter(
      (initiative) =>
        initiative.status === "off_track" || initiative.status === "at_risk",
    )
    .map((initiative) => ({
      item: {
        type: "initiative" as const,
        name: initiative.nameEn,
        importance: initiative.status === "off_track" ? "critical" : "medium",
        reason:
          initiative.status === "off_track"
            ? `${initiative.nameEn} is off track and needs executive attention.`
            : `${initiative.nameEn} is at risk.`,
      },
      magnitude: initiative.status === "off_track" ? 1 : 0,
    }));
}

const IMPORTANCE_RANK: Record<AudioBriefItem["importance"], number> = {
  critical: 0,
  medium: 1,
  positive: 2,
};

/**
 * Selects a small, bounded, ranked list of significant items across KPIs,
 * OKRs, and initiatives. Critical and medium items are ranked ahead of
 * positive ones and take priority for the item cap; positive items are
 * capped separately so good news cannot crowd out what needs attention.
 */
export function selectSignificantItems(
  signals: AudioBriefSignals,
): AudioBriefItem[] {
  const all = [
    ...kpiCandidates(signals.kpis),
    ...okrCandidates(signals.okrs),
    ...initiativeCandidates(signals.initiatives),
  ].sort((a, b) => {
    const rankDiff =
      IMPORTANCE_RANK[a.item.importance] - IMPORTANCE_RANK[b.item.importance];
    return rankDiff !== 0 ? rankDiff : b.magnitude - a.magnitude;
  });

  const negative = all.filter((candidate) => candidate.item.importance !== "positive");
  const positive = all
    .filter((candidate) => candidate.item.importance === "positive")
    .slice(0, MAX_POSITIVE_ITEMS);

  return [...negative, ...positive]
    .slice(0, MAX_BRIEF_ITEMS)
    .map((candidate) => candidate.item);
}
