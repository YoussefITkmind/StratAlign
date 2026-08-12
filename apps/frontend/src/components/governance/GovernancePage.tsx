"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Activity, CheckCircle2, FileText, Shield, TriangleAlert, Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { AuditTrailEntry, DecisionLogEntry } from "@/types/governance";
import {
  auditTrail as initialAuditTrail,
  committees,
  complianceItems,
  decisionLog as initialDecisionLog,
  risks,
} from "@/data/mockGovernanceData";
import ApprovalsTab from "./tabs/ApprovalsTab";
import DecisionLogTab from "./tabs/DecisionLogTab";
import CommitteesTab from "./tabs/CommitteesTab";
import RiskRegisterTab from "./tabs/RiskRegisterTab";
import ComplianceTab from "./tabs/ComplianceTab";
import AuditTrailTab from "./tabs/AuditTrailTab";
import type { RealApprovalCase } from "./ApprovalCard";

type TabKey = "approvals" | "decision-log" | "committees" | "risk-register" | "compliance" | "audit-trail";
const EMPTY_APPROVALS: RealApprovalCase[] = [];

export default function GovernancePage() {
  const [tab, setTab] = useState<TabKey>("approvals");
  const utils = trpc.useUtils();
  const approvalsQuery = trpc.governance.myPendingApprovals.useQuery();
  const approvals = (approvalsQuery.data as RealApprovalCase[] | undefined) ?? EMPTY_APPROVALS;
  const decide = trpc.governance.decide.useMutation();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Decision Log / Audit Trail below stay on illustrative mock data for now —
  // Governance only exposes decisions per-case (governance.getCase), not a
  // global feed, so a real cross-case list isn't backed by any endpoint yet.
  const [decisionLog] = useState<DecisionLogEntry[]>(initialDecisionLog);
  const [auditTrail] = useState<AuditTrailEntry[]>(initialAuditTrail);

  const stats = useMemo(() => {
    const pendingApprovals = approvals.length;
    const escalated = approvals.filter((a) => a.escalated).length;
    const openRisks = risks.length;
    const compliantCount = complianceItems.filter((c) => c.status === "compliant").length;
    const complianceRate = Math.round((compliantCount / complianceItems.length) * 100);
    return { pendingApprovals, escalated, openRisks, complianceRate };
  }, [approvals]);

  const handleDecide = async (id: string, decision: "approved" | "rejected" | "changes_requested", reason: string) => {
    setDecidingId(id);
    setDecisionError(null);
    try {
      await decide.mutateAsync({ id, decision, ...(reason ? { reason } : {}) });
      await utils.governance.myPendingApprovals.invalidate();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Could not record that decision");
    } finally {
      setDecidingId(null);
    }
  };

  const tabs: { key: TabKey; label: string; icon: ComponentType<{ className?: string }>; badge?: number }[] = [
    { key: "approvals", label: "Approvals", icon: CheckCircle2, badge: stats.pendingApprovals },
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
          <StatPill dot="bg-red-500" label={`${stats.escalated} escalated`} />
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
        approvalsQuery.isLoading ? (
          <p className="p-8 text-sm text-gray-500">Loading…</p>
        ) : approvalsQuery.error ? (
          <p role="alert" className="p-8 text-sm text-red-600">{approvalsQuery.error.message}</p>
        ) : (
          <ApprovalsTab approvals={approvals} onDecide={(id, decision, reason) => void handleDecide(id, decision, reason)} decidingId={decidingId} error={decisionError} />
        )
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
