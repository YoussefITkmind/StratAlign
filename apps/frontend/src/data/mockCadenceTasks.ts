import { CadenceTask } from "@/types/kpi";

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

export const initialCadenceTasks: CadenceTask[] = [
  { id: "task-churn-q", kpiId: "kpi-churn", period: "This month", dueDate: daysFromNow(3), state: "not-started" },
  { id: "task-csat-q", kpiId: "kpi-csat", period: "This month", dueDate: daysFromNow(5), state: "draft" },
  { id: "task-aht-q", kpiId: "kpi-aht", period: "This week", dueDate: daysFromNow(-1), state: "not-started" },
  { id: "task-engagement-q", kpiId: "kpi-engagement", period: "This quarter", dueDate: daysFromNow(14), state: "submitted" },
];
