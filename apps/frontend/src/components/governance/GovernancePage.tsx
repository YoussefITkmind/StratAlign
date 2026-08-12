"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Activity, CheckCircle2, FileText, Shield, TriangleAlert, Users } from "lucide-react";
import type { ApprovalCase, AuditTrailEntry, DecisionLogEntry } from "@/types/governance";
import {
  MOCK_NOW,
  auditTrail as initialAuditTrail,
  committees,
  complianceItems,
  decisionLog as initialDecisionLog,
  initialApprovals,
  risks,
} from "@/data/mockGovernanceData";
import { isOverdue } from "@/lib/governanceConfig";
import ApprovalsTab from "./tabs/ApprovalsTab";
import DecisionLogTab from "./tabs/DecisionLogTab";
import CommitteesTab from "./tabs/CommitteesTab";
import RiskRegisterTab from "./tabs/RiskRegisterTab";
import ComplianceTab from "./tabs/ComplianceTab";
import AuditTrailTab from "./tabs/AuditTrailTab";

const CURRENT_USER = { name: "Alex Morgan", initials: "AM" };

type TabKey = "approvals" | "decision-log" | "committees" | "risk-register" | "compliance" | "audit-trail";

export default function GovernancePage() {
  const [tab, setTab] = useState<TabKey>("approvals");
  const [approvals, setApprovals] = useState<ApprovalCase[]>(initialApprovals);
  const [decisionLog, setDecisionLog] = useState<DecisionLogEntry[]>(initialDecisionLog);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>(initialAuditTrail);

  const stats = useMemo(() => {
    const pendingApprovals = approvals.filter((a) => a.status === "pending").length;
    const overdueActions = approvals.filter(
      (a) => (a.status === "pending" || a.status === "escalated") && isOverdue(a.dueDate, MOCK_NOW)
    ).length;
    const openRisks = risks.length;
    const compliantCount = complianceItems.filter((c) => c.status === "compliant").length;
    const complianceRate = Math.round((compliantCount / complianceItems.length) * 100);
    return { pendingApprovals, overdueActions, openRisks, complianceRate };
  }, [approvals]);

  const recordDecision = (approval: ApprovalCase, outcome: "approved" | "rejected", rationale: string) => {
    setDecisionLog((prev) => [
      {
        id: `dec-${approval.id}-${Date.now()}`,
        title: approval.title,
        category: approval.category,
        outcome,
        committee: approval.committee,
        decidedBy: CURRENT_USER,
        decidedDate: MOCK_NOW,
        rationale,
      },
      ...prev,
    ]);
    setAuditTrail((prev) => [
      {
        id: `audit-${approval.id}-${Date.now()}`,
        actor: CURRENT_USER,
        action: outcome === "approved" ? "Approved" : "Rejected",
        entity: approval.title,
        actionType: outcome === "approved" ? "approve" : "reject",
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const handleApprove = (id: string) => {
    const approval = approvals.find((a) => a.id === id);
    if (!approval) return;
    const updated: ApprovalCase = { ...approval, status: "approved", decidedBy: CURRENT_USER, decidedDate: MOCK_NOW };
    setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
    recordDecision(updated, "approved", "Approved via the Governance approval tray.");
  };

  const handleReject = (id: string) => {
    const approval = approvals.find((a) => a.id === id);
    if (!approval) return;
    const reason = "Rejected via the Governance approval tray.";
    const updated: ApprovalCase = { ...approval, status: "rejected", decidedBy: CURRENT_USER, decidedDate: MOCK_NOW, decisionReason: reason };
    setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
    recordDecision(updated, "rejected", reason);
  };

  const handleEscalate = (id: string) => {
    setApprovals((prev) => prev.map((a) => (a.id === id ? { ...a, status: "escalated" } : a)));
    const approval = approvals.find((a) => a.id === id);
    if (!approval) return;
    setAuditTrail((prev) => [
      {
        id: `audit-${id}-${Date.now()}`,
        actor: CURRENT_USER,
        action: "Escalated",
        entity: approval.title,
        actionType: "update",
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const tabs: { key: TabKey; label: string; icon: ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: "approvals", label: "Approvals", icon: CheckCircle2, badge: stats.pendingApprovals + approvals.filter((a) => a.status === "escalated").length },
    { key: "decision-log", label: "Decision Log", icon: FileText },
    { key: "committees", label: "Committees", icon: Users, badge: committees.filter((c) => c.needsAttention).length },
    { key: "risk-register", label: "Risk Register", icon: TriangleAlert, badge: risks.filter((r) => r.severity === "critical").length },
    { key: "compliance", label: "Compliance", icon: Shield, badge: complianceItems.filter((c) => c.status === "non-compliant").length },
    { key: "audit-trail", label: "Audit Trail", icon: Activity },
  ];

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      {/* header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">Governance</h1>
          <p className="mt-0.5 text-sm text-gray-500">Approvals · Decisions · Risk · Compliance · Audit</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatPill dot="bg-amber-500" label={`${stats.pendingApprovals} pending approvals`} />
          <StatPill dot="bg-red-500" label={`${stats.overdueActions} overdue actions`} />
          <StatPill dot="bg-red-500" label={`${stats.openRisks} open risks`} />
          <StatPill dot="bg-amber-500" label={`${stats.complianceRate}% compliant`} />
        </div>
      </div>

      {/* tabs */}
      <div className="mb-5 flex items-center gap-6 border-b border-gray-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              data-testid={`governance-tab-${t.key}`}
              className={`relative flex items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-medium transition ${
                isActive ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {!!t.badge && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white">
                    {t.badge}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "approvals" && (
        <ApprovalsTab approvals={approvals} onApprove={handleApprove} onReject={handleReject} onEscalate={handleEscalate} />
      )}
      {tab === "decision-log" && <DecisionLogTab entries={decisionLog} />}
      {tab === "committees" && <CommitteesTab committees={committees} />}
      {tab === "risk-register" && <RiskRegisterTab risks={risks} />}
      {tab === "compliance" && <ComplianceTab items={complianceItems} />}
      {tab === "audit-trail" && <AuditTrailTab entries={auditTrail} />}
    </div>
  );
}

function StatPill({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
