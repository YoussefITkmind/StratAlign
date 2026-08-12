import type { CadenceTask, Kpi } from "@/types/kpi";

const KPI_STATUS_SEVERITY: Record<Kpi["status"], number> = {
  behind: 0,
  "at-risk": 1,
  "on-track": 2,
};

function relativeVariance(kpi: Kpi): number {
  return Math.abs(kpi.actual - kpi.target) / (kpi.target || 1);
}

/** Top KPI tiles: worst status first, then largest gap to target within a status tier. */
export function selectTopKpis(kpis: Kpi[], limit = 4): Kpi[] {
  return [...kpis]
    .sort((a, b) => {
      const severity = KPI_STATUS_SEVERITY[a.status] - KPI_STATUS_SEVERITY[b.status];
      return severity !== 0 ? severity : relativeVariance(b) - relativeVariance(a);
    })
    .slice(0, limit);
}

/** Off-track/breached KPIs for the Exceptions widget, worst first. */
export function selectExceptions(kpis: Kpi[]): Kpi[] {
  return kpis
    .filter((kpi) => kpi.status === "behind" || kpi.status === "at-risk")
    .sort((a, b) => KPI_STATUS_SEVERITY[a.status] - KPI_STATUS_SEVERITY[b.status]);
}

export function kpisOwnedBy(kpis: Kpi[], ownerName: string): Kpi[] {
  return kpis.filter((kpi) => kpi.owner.name === ownerName);
}

export function cadenceTasksFor(tasks: CadenceTask[], kpiIds: readonly string[]): CadenceTask[] {
  const ids = new Set(kpiIds);
  return tasks.filter((task) => ids.has(task.kpiId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/**
 * There is no real user<->KPI-owner linkage in the mock data (owners are
 * plain names, same as the hardcoded CURRENT_USER used elsewhere in the app
 * shell). "Jamie Park" owns both a KPI and its matching cadence task in the
 * Phase 2/3 fixtures, which makes the kpi_owner widgets demoable end to end.
 */
export const HOME_DEMO_OWNER_NAME = "Jamie Park";
