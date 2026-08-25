import { Filters, Scorecard } from "@/types/scorecard";

export function filterScorecards(scorecards: Scorecard[], filters: Filters): Scorecard[] {
  const search = filters.search.trim().toLowerCase();

  return scorecards.flatMap((sc) => {
    if (filters.department !== "all" && sc.department !== filters.department) return [];
    if (filters.status !== "all" && sc.status !== filters.status) return [];
    if (!search) return [sc];

    const matchesScorecard = sc.name.toLowerCase().includes(search) || sc.ownerName.toLowerCase().includes(search);
    if (matchesScorecard) return [sc];

    const perspectives = sc.perspectives.flatMap((perspective) => {
      const kpis = perspective.kpis.filter((kpi) => kpi.name.toLowerCase().includes(search));
      return kpis.length > 0 ? [{ ...perspective, kpis }] : [];
    });

    return perspectives.length > 0 ? [{ ...sc, perspectives }] : [];
  });
}

export function groupByDepartment(scorecards: Scorecard[]): [string, Scorecard[]][] {
  const grouped = new Map<string, Scorecard[]>();
  for (const sc of scorecards) {
    const bucket = grouped.get(sc.department);
    if (bucket) bucket.push(sc);
    else grouped.set(sc.department, [sc]);
  }
  return Array.from(grouped.entries());
}

export function statusCounts(scorecards: Scorecard[]): { onTrack: number; atRisk: number; draft: number } {
  return scorecards.reduce(
    (acc, sc) => {
      if (sc.status === "on-track") acc.onTrack += 1;
      else if (sc.status === "at-risk") acc.atRisk += 1;
      else acc.draft += 1;
      return acc;
    },
    { onTrack: 0, atRisk: 0, draft: 0 }
  );
}

export function totalKpis(scorecards: Scorecard[]): number {
  return scorecards.reduce(
    (sum, sc) => sum + sc.perspectives.reduce((perspectiveSum, p) => perspectiveSum + p.kpis.length, 0),
    0
  );
}

export function isFiltering(filters: Filters): boolean {
  return filters.search.trim() !== "" || filters.department !== "all" || filters.status !== "all";
}
