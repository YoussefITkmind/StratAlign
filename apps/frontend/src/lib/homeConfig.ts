import type { CadenceTask, Kpi } from "@/types/kpi";
import type { ApprovalCase, Committee, RiskItem } from "@/types/governance";

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

export type CalendarItemKind = "committee" | "risk" | "approval";

export interface CalendarItem {
  id: string;
  date: string;
  kind: CalendarItemKind;
  title: string;
  detail: string;
}

/**
 * Upcoming review-calendar items merged from three Phase 2/3 governance
 * fixtures (committee meetings, risk reviews, approval due dates). `nowIso`
 * should be the dataset's own MOCK_NOW, not the real clock — see
 * mockGovernanceData.ts's comment on why its dates are pinned to 2025-07-19.
 */
export function buildReviewCalendar(
  committees: Committee[],
  risks: RiskItem[],
  approvals: ApprovalCase[],
  nowIso: string,
  limit = 5
): CalendarItem[] {
  const items: CalendarItem[] = [
    ...committees.map((c) => ({
      id: `committee-${c.id}`,
      date: c.nextMeeting,
      kind: "committee" as const,
      title: c.name,
      detail: `${c.code} · ${c.pendingItems} pending`,
    })),
    ...risks
      .filter((r) => r.status === "open" || r.status === "mitigating")
      .map((r) => ({
        id: `risk-${r.id}`,
        date: r.reviewDate,
        kind: "risk" as const,
        title: r.title,
        detail: `Risk review · ${r.owner.name}`,
      })),
    ...approvals
      .filter((a) => a.status === "pending" || a.status === "escalated")
      .map((a) => ({
        id: `approval-${a.id}`,
        date: a.dueDate,
        kind: "approval" as const,
        title: a.title,
        detail: `${a.committee} · ${a.status === "escalated" ? "Escalated" : "Due"}`,
      })),
  ];

  return items
    .filter((item) => item.date >= nowIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/**
 * There is no real user<->KPI-owner linkage in the mock data (owners are
 * plain names, same as the hardcoded CURRENT_USER used elsewhere in the app
 * shell). "Jamie Park" owns both a KPI and its matching cadence task in the
 * Phase 2/3 fixtures, which makes the kpi_owner widgets demoable end to end.
 */
export const HOME_DEMO_OWNER_NAME = "Jamie Park";
