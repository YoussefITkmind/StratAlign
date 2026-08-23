"use client";

import Link from "next/link";
import { useMemo, useState, type ComponentType } from "react";
import { Activity, CheckCircle2, FileText, Shield, TriangleAlert, Users } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import ApprovalsTab from "./tabs/ApprovalsTab";
import DecisionLogTab, { type RealDecisionLogEntry } from "./tabs/DecisionLogTab";
import UnsupportedTab from "./tabs/UnsupportedTab";
import type { ApprovalDecision, RealApprovalCase } from "./ApprovalCard";

type TabKey = "approvals" | "decision-log" | "committees" | "risk-register" | "compliance" | "audit-trail";
const EMPTY_APPROVALS: RealApprovalCase[] = [];
const EMPTY_DECISIONS: RealDecisionLogEntry[] = [];
const MAX_ASSISTANT_CONTEXT_ITEMS = 25;

const tabs: { key: TabKey; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "approvals", label: "Approvals", icon: CheckCircle2 },
  { key: "decision-log", label: "Decision Log", icon: FileText },
  { key: "committees", label: "Committees", icon: Users },
  { key: "risk-register", label: "Risk Register", icon: TriangleAlert },
  { key: "compliance", label: "Compliance", icon: Shield },
  { key: "audit-trail", label: "Audit Trail", icon: Activity },
];

export default function GovernancePage() {
  const [tab, setTab] = useState<TabKey>("approvals");
  const utils = trpc.useUtils();
  const approvalsQuery = trpc.governance.myPendingApprovals.useQuery();
  const approvals = (approvalsQuery.data as RealApprovalCase[] | undefined) ?? EMPTY_APPROVALS;
  const decisionsQuery = trpc.governance.listDecisions.useQuery(undefined, { enabled: tab === "decision-log" });
  const decisions = (decisionsQuery.data as RealDecisionLogEntry[] | undefined) ?? EMPTY_DECISIONS;
  const decide = trpc.governance.decide.useMutation();
  const decideValueGate = trpc.valueGate.decide.useMutation();
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const pendingApprovals = approvals.length;
  const escalated = approvals.filter((a) => a.escalated).length;

  const assistantData = useMemo(() => {
    if (!approvalsQuery.data) return null;
    return {
      pendingApprovals,
      escalated,
      approvals: approvals.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((approval) => ({
        entityType: approval.entityType,
        status: approval.status,
        escalated: approval.escalated,
        submittedBy: approval.submittedBy,
      })),
      decisions: decisionsQuery.data
        ? decisions.slice(0, MAX_ASSISTANT_CONTEXT_ITEMS).map((entry) => ({
            entityType: entry.entityType,
            decision: entry.decision,
            decidedBy: entry.decidedBy,
          }))
        : null,
    };
  }, [approvalsQuery.data, pendingApprovals, escalated, approvals, decisionsQuery.data, decisions]);
  usePublishAssistantContext("governance", null, assistantData);

  const handleDecide = async (id: string, decision: ApprovalDecision, reason: string) => {
    setDecidingId(id);
    setDecisionError(null);
    try {
      const approval = approvals.find((item) => item.id === id);
      if (!approval) throw new Error("Approval is no longer available");

      if (approval.entityType === "value_gate_review") {
        if (decision !== "continue" && decision !== "intervene" && decision !== "stop") {
          throw new Error("Use a Value Gate committee decision for this approval");
        }
        await decideValueGate.mutateAsync({
          gateReviewId: approval.entityId,
          decision,
        });
      } else {
        if (decision !== "approved" && decision !== "rejected" && decision !== "changes_requested") {
          throw new Error("Invalid governance decision for this approval");
        }
        await decide.mutateAsync({ id, decision, ...(reason ? { reason } : {}) });
      }

      await Promise.all([
        utils.governance.myPendingApprovals.invalidate(),
        utils.governance.listDecisions.invalidate(),
      ]);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Could not record that decision");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900">Governance</h1>
          <p className="mt-0.5 text-sm text-gray-500">Approvals · Decisions</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatPill dot="bg-amber-500" label={`${pendingApprovals} pending approvals`} />
          <StatPill dot="bg-red-500" label={`${escalated} escalated`} />
        </div>
      </div>

      <div className="mb-5 flex items-center gap-4 overflow-x-auto border-b border-gray-200 sm:gap-6">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          const badge = t.key === "approvals" ? pendingApprovals : undefined;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              data-testid={`governance-tab-${t.key}`}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition ${
                isActive ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {!!badge && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white">
                    {badge}
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

      {tab === "decision-log" && (
        decisionsQuery.isLoading ? (
          <p className="p-8 text-sm text-gray-500">Loading…</p>
        ) : decisionsQuery.error ? (
          <p role="alert" className="p-8 text-sm text-red-600">{decisionsQuery.error.message}</p>
        ) : (
          <DecisionLogTab entries={decisions} />
        )
      )}

      {tab === "committees" && (
        <UnsupportedTab
          icon={Users}
          title="Committees isn't available yet"
          body="Committee management isn't backed by a real module in this workspace yet. This tab will populate once it ships."
        />
      )}

      {tab === "risk-register" && (
        <UnsupportedTab
          icon={TriangleAlert}
          title="Risk Register isn't available yet"
          body="Risk tracking isn't backed by a real module in this workspace yet. This tab will populate once it ships."
        />
      )}

      {tab === "compliance" && (
        <UnsupportedTab
          icon={Shield}
          title="Compliance isn't available yet"
          body="Compliance tracking isn't backed by a real module in this workspace yet. This tab will populate once it ships."
        />
      )}

      {tab === "audit-trail" && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-white px-4 py-16 text-center">
          <Activity className="h-6 w-6 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">Governance-scoped audit trail isn&apos;t available yet</p>
          <p className="max-w-sm text-sm text-gray-400">
            The platform keeps a real, hash-chained audit journal, viewable by platform administrators.
          </p>
          <Link href="/audit" className="mt-1 text-sm font-medium text-blue-600 hover:underline">
            Open the platform audit log →
          </Link>
        </div>
      )}
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
