import { colorForInitials } from "@/lib/scorecardConfig";
import { EscalationCase, EscalationSummary } from "@/types/case";

function owner(name: string) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return { name, initials, color: colorForInitials(initials) };
}

export const mockCases: EscalationCase[] = [
  {
    id: "esc-1",
    title: "Revenue KPI off-track for 3 consecutive weeks",
    tag: "Value Gate",
    priority: "Critical",
    owner: owner("Alex Morgan"),
    status: "Open",
    slaZone: "overdue",
    slaLabel: "Overdue by 4h",
  },
  {
    id: "esc-2",
    title: "Scorecard weighting change pending sign-off",
    tag: "Approval",
    priority: "High",
    owner: owner("Jamie Park"),
    status: "Open",
    slaZone: "near",
    slaLabel: "Due in 3h",
  },
  {
    id: "esc-3",
    title: "Strategy map objective link disputed",
    tag: "Strategy Map",
    priority: "Medium",
    owner: owner("Sam Rivera"),
    status: "Acknowledged",
    slaZone: "on-track",
    slaLabel: "Due in 2d",
  },
  {
    id: "esc-4",
    title: "Committee stop decision needs escalation review",
    tag: "Value Gate",
    priority: "Critical",
    owner: owner("Alex Morgan"),
    status: "Escalated",
    slaZone: "overdue",
    slaLabel: "Overdue by 1d",
  },
  {
    id: "esc-5",
    title: "Q3 EBITDA variance exceeds threshold",
    tag: "Scorecard",
    priority: "High",
    owner: owner("Priya Shah"),
    status: "In Review",
    slaZone: "near",
    slaLabel: "Due in 6h",
  },
  {
    id: "esc-6",
    title: "OKR check-in overdue for Customer perspective",
    tag: "KPI",
    priority: "Medium",
    owner: owner("Jamie Park"),
    status: "Open",
    slaZone: "on-track",
    slaLabel: "Due in 1d",
  },
  {
    id: "esc-7",
    title: "Compliance attestation missing for Q3 gate",
    tag: "Compliance",
    priority: "Low",
    owner: owner("Sam Rivera"),
    status: "Resolved",
    slaZone: "on-track",
    slaLabel: "Closed",
  },
];

export const mockSummary: EscalationSummary = {
  totalCases: mockCases.length,
  unacknowledged: mockCases.filter((c) => c.status === "Open").length,
  nearSla: mockCases.filter((c) => c.slaZone === "near").length,
  overdue: mockCases.filter((c) => c.slaZone === "overdue").length,
};
