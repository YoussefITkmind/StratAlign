export type CasePriority = "Critical" | "High" | "Medium" | "Low";

export type CaseStatus = "Open" | "Acknowledged" | "Escalated" | "In Review" | "Resolved";

/** Time-remaining-vs-deadline bucket, mapped to the shared RAG tokens for the SLA chip color. */
export type SLAZone = "overdue" | "near" | "on-track";

export interface CaseOwner {
  name: string;
  initials: string;
  color: string;
}

export interface EscalationCase {
  id: string;
  title: string;
  tag: string;
  priority: CasePriority;
  owner: CaseOwner;
  status: CaseStatus;
  slaZone: SLAZone;
  slaLabel: string;
}

export interface EscalationSummary {
  totalCases: number;
  unacknowledged: number;
  nearSla: number;
  overdue: number;
}
