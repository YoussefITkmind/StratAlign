export type Person = { name: string; initials: string };

export type ApprovalCategory = "KPI" | "Budget" | "Risk" | "Policy" | "Strategy";
export type ApprovalStatus = "pending" | "escalated" | "approved" | "rejected";
export type ApprovalPriority = "urgent" | "normal";

export interface ApprovalCase {
  id: string;
  category: ApprovalCategory;
  title: string;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  committee: string;
  dueDate: string;
  submittedBy: Person;
  submittedDate: string;
  commentsCount: number;
  description: string;
  decidedBy?: Person;
  decidedDate?: string;
  decisionReason?: string;
}

export type DecisionOutcome = "approved" | "rejected";

export interface DecisionLogEntry {
  id: string;
  title: string;
  category: ApprovalCategory;
  outcome: DecisionOutcome;
  committee: string;
  decidedBy: Person;
  decidedDate: string;
  rationale: string;
}

export interface Committee {
  id: string;
  code: string;
  name: string;
  chair: Person;
  memberCount: number;
  nextMeeting: string;
  pendingItems: number;
  needsAttention: boolean;
}

export type RiskSeverity = "critical" | "high" | "medium" | "low";
export type RiskStatus = "open" | "mitigating" | "accepted" | "closed";

export interface RiskItem {
  id: string;
  title: string;
  category: string;
  severity: RiskSeverity;
  status: RiskStatus;
  owner: Person;
  identifiedDate: string;
  reviewDate: string;
  description: string;
}

export type ComplianceStatus = "compliant" | "at-risk" | "non-compliant";

export interface ComplianceItem {
  id: string;
  framework: string;
  requirement: string;
  status: ComplianceStatus;
  owner: Person;
  lastReviewed: string;
  nextReview: string;
}

export type AuditActionType = "create" | "update" | "delete" | "approve" | "reject";

export interface AuditTrailEntry {
  id: string;
  actor: Person;
  action: string;
  entity: string;
  actionType: AuditActionType;
  timestamp: string;
}

export interface GovernanceStats {
  pendingApprovals: number;
  overdueActions: number;
  openRisks: number;
  complianceRate: number;
}
