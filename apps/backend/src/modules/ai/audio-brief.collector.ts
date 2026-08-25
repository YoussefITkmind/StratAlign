import type {
  AudioBriefDataSources,
  BriefInitiativeSnapshot,
  BriefKpiSnapshot,
  BriefKpiStatus,
  BriefOkrSnapshot,
  BriefSnapshot,
} from "./audio-brief.types";

/**
 * Reads the platform's existing domain services and normalises what they
 * return into the flat snapshot `audio-brief.selection` scores.
 *
 * This module owns no data and computes no significance. It exists so the
 * selection rules can stay pure — they see numbers and statuses, never a
 * Prisma row or a service call — and so the per-request read stays bounded
 * regardless of how large the registry grows.
 */

/**
 * How many active KPIs get a detail read. Each one is a separate query, so
 * this is the number that decides what an audio brief costs the database.
 * It matches the Home snapshot's own ceiling deliberately: the brief speaks
 * about the same slice of the portfolio the executive already sees.
 */
const MAX_KPIS_INSPECTED = 12;

const MAX_OKRS_INSPECTED = 20;

const MAX_INITIATIVES_INSPECTED = 20;

/**
 * Collapses the several status vocabularies the platform's threshold rules can
 * produce onto the four the brief reasons about. Unrecognised values become
 * `unknown` rather than being guessed at — an invented status would become an
 * invented sentence in the script.
 */
export function normalizeKpiStatus(status: string | null | undefined): BriefKpiStatus {
  const value = (status ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (value === "on_track" || value === "green") return "on_track";
  if (value === "watch" || value === "at_risk" || value === "amber") return "watch";
  if (value === "off_track" || value === "breached" || value === "red") return "off_track";
  return "unknown";
}

function normalizePolarity(polarity: string): BriefKpiSnapshot["polarity"] {
  return polarity === "lower_is_better" ? "lower_is_better" : "higher_is_better";
}

function normalizeInitiativeStatus(
  status: string | null,
): BriefInitiativeSnapshot["status"] {
  return status === "on_track" || status === "at_risk" || status === "off_track"
    ? status
    : null;
}

function normalizeConfidence(
  confidence: string | null,
): BriefInitiativeSnapshot["confidence"] {
  return confidence === "high" || confidence === "medium" || confidence === "low"
    ? confidence
    : null;
}

/**
 * Mean progress across the key results that actually report a figure.
 *
 * Null-progress key results are excluded rather than counted as zero: a key
 * result nobody has updated yet is missing data, and treating it as zero would
 * report an objective as failing when it may simply be unmeasured.
 */
function averageProgress(
  keyResults: ReadonlyArray<{ progressPercent: number | null }>,
): number | null {
  const reported = keyResults
    .map((keyResult) => keyResult.progressPercent)
    .filter((progress): progress is number => progress !== null && Number.isFinite(progress));

  if (reported.length === 0) {
    return null;
  }

  return reported.reduce((total, progress) => total + progress, 0) / reported.length;
}

async function collectKpis(
  sources: AudioBriefDataSources,
): Promise<BriefKpiSnapshot[]> {
  const registryRows = await sources.kpiRegistry.list();
  const active = registryRows
    .filter((row) => row.definition.status === "active")
    .slice(0, MAX_KPIS_INSPECTED);

  const details = await Promise.all(
    active.map((row) => sources.performance.getKpiDetail(row.definition.id)),
  );

  return active.flatMap((row, index) => {
    const detail = details[index];
    if (!detail) return [];

    const measurements = [...detail.measurements].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    const latest = measurements.at(-1);
    if (!latest) return [];

    const sameCoordinate = <T extends { scopeNodeId: string; period: string }>(
      candidate: T,
    ) => candidate.scopeNodeId === latest.scopeNodeId && candidate.period === latest.period;

    // Reversed lookup: `latestByKey` in the detail service already collapses to
    // one row per coordinate, but ordering is ascending, so the last match is
    // the most recently recorded one for this scope and period.
    const target = [...detail.targets].reverse().find(sameCoordinate);
    const status = [...detail.statuses].reverse().find(sameCoordinate);

    const scopeHistory = measurements.filter(
      (candidate) => candidate.scopeNodeId === latest.scopeNodeId,
    );
    const previous = scopeHistory.length > 1 ? (scopeHistory.at(-2)?.value ?? null) : null;

    return [
      {
        id: row.definition.id,
        name: row.version.nameEn,
        unit: row.version.unit,
        polarity: normalizePolarity(row.version.polarity),
        status: normalizeKpiStatus(status?.status),
        actual: latest.value,
        target: target?.targetValue ?? null,
        previous,
        period: latest.period,
      },
    ];
  });
}

async function collectOkrs(
  sources: AudioBriefDataSources,
): Promise<BriefOkrSnapshot[]> {
  const okrs = await sources.okrRegistry.list();

  return okrs.slice(0, MAX_OKRS_INSPECTED).map((okr) => ({
    id: okr.id,
    name: okr.nameEn,
    progressPercent: averageProgress(okr.keyResults),
    keyResultCount: okr.keyResults.length,
  }));
}

async function collectInitiatives(
  sources: AudioBriefDataSources,
  actorUserId: string,
): Promise<BriefInitiativeSnapshot[]> {
  const initiatives = await sources.execution.list({ scope: "all", actorUserId });

  return initiatives.slice(0, MAX_INITIATIVES_INSPECTED).map((initiative) => ({
    id: initiative.id,
    name: initiative.nameEn,
    stage: initiative.stage,
    status: normalizeInitiativeStatus(initiative.latestStatus),
    confidence: normalizeConfidence(initiative.latestConfidence),
  }));
}

export async function collectBriefSnapshot(
  sources: AudioBriefDataSources,
  actorUserId: string,
): Promise<BriefSnapshot> {
  const [kpis, okrs, initiatives] = await Promise.all([
    collectKpis(sources),
    collectOkrs(sources),
    collectInitiatives(sources, actorUserId),
  ]);

  return { kpis, okrs, initiatives };
}
