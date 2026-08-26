"use client";

import { useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import type { KpiLibraryRow } from "@/data/mockKpiLibrary";
import { trpc } from "@/lib/trpc/client";

const PERSPECTIVE_LABEL: Record<KpiLibraryRow["perspective"], string> = {
  financial: "Financial",
  customer: "Customer",
  internal: "Internal",
  learning: "Learning",
};

const STATUS_META: Record<KpiLibraryRow["status"], { label: string; bg: string; text: string; dot: string }> = {
  "on-track": { label: "On Track", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "at-risk": { label: "At Risk", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  behind: { label: "Behind", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
};

const APPROVAL_LABEL: Record<KpiLibraryRow["approval"], string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
};

const TABS = ["Overview", "History", "Comments", "Approval"] as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function TrendChart({ values, favorable }: { values: number[]; favorable: boolean }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 320;
  const h = 90;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 10) - 5;
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  const color = favorable ? "#10b981" : "#f59e0b";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full">
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 3.5 : 2.5} fill={color} />
      ))}
    </svg>
  );
}

export default function KpiDetailDrawer({ row, onClose }: { row: KpiLibraryRow; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [approvalParticipantId, setApprovalParticipantId] = useState("");
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const statusMeta = STATUS_META[row.status];
  const isRegistryKpi = row.tag === "Registry";
  const utils = trpc.useUtils();

  const persistedKpi = trpc.registry.kpi.get.useQuery(
    { kpiDefinitionId: row.id },
    { enabled: isRegistryKpi },
  );
  const approvalCase = trpc.governance.getLatestCaseForEntity.useQuery(
    { entityType: "KpiDefinition", entityId: row.id },
    { enabled: isRegistryKpi },
  );

  const refreshApproval = async () => {
    if (!isRegistryKpi) return;
    await Promise.all([
      utils.governance.getLatestCaseForEntity.invalidate({ entityType: "KpiDefinition", entityId: row.id }),
      utils.registry.kpi.get.invalidate({ kpiDefinitionId: row.id }),
      utils.registry.kpi.list.invalidate(),
    ]);
  };

  const submitForApproval = trpc.governance.submit.useMutation({
    onSuccess: async () => {
      setApprovalError(null);
      setApprovalNotice("Submitted for approval.");
      await refreshApproval();
    },
    onError: (cause) => {
      setApprovalNotice(null);
      setApprovalError(message(cause));
    },
  });

  const publish = trpc.registry.kpi.publishVersion.useMutation({
    onSuccess: async () => {
      setApprovalError(null);
      setApprovalNotice("Approved KPI published.");
      await refreshApproval();
    },
    onError: (cause) => {
      setApprovalNotice(null);
      setApprovalError(message(cause));
    },
  });

  const submitDraft = () => {
    const participant = approvalParticipantId.trim();
    if (!participant || !persistedKpi.data) return;
    setApprovalError(null);
    setApprovalNotice(null);
    submitForApproval.mutate({
      entityType: "KpiDefinition",
      entityId: row.id,
      approvalParticipantId: participant,
      proposedChange: {
        before: null,
        after: persistedKpi.data.version,
        impactSummary: "New KPI definition",
      },
    });
  };

  const publishApprovedDraft = () => {
    const latestCase = approvalCase.data;
    const version = persistedKpi.data?.version;
    if (!latestCase || latestCase.status !== "approved" || !version || version.publishedAt) return;
    setApprovalError(null);
    setApprovalNotice(null);
    publish.mutate({ kpiVersionId: version.id, approvalCaseId: latestCase.id });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="app-scroll flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wide ${STATUS_META[row.status].text}`}>
                {PERSPECTIVE_LABEL[row.perspective]} · {row.department}
              </p>
              <h2 className="mt-1 text-lg font-bold text-gray-900">{row.name}</h2>
            </div>
            <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-4 flex gap-4 border-b border-gray-100">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-0.5 pb-2 text-sm font-medium uppercase tracking-wide ${tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 space-y-5 p-5">
          {tab === "Overview" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Actual" value={row.actual} />
                <StatCard label="Target" value={row.target} />
                <StatCard label="Variance" value={row.variance} tone={row.favorable ? "text-emerald-600" : "text-red-500"} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">6-Period Trend</p>
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3"><TrendChart values={row.trend} favorable={row.favorable} /></div>
              </div>
              <dl className="space-y-3 border-t border-gray-100 pt-4">
                <DetailRow label="Owner"><span className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${row.owner.color}`}>{row.owner.initials}</span>{row.owner.name}</span></DetailRow>
                <DetailRow label="Department">{row.department}</DetailRow>
                <DetailRow label="Frequency">{row.freq}</DetailRow>
                <DetailRow label="Category">{row.tag}</DetailRow>
                <DetailRow label="Status"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.bg} ${statusMeta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}</span></DetailRow>
                <DetailRow label="Approval">{APPROVAL_LABEL[row.approval]}</DetailRow>
              </dl>
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p>
                <p className="text-sm leading-relaxed text-gray-600">{row.description ?? `${row.name} is tracked under ${row.tag} for the ${row.department} team, reported ${row.freq.toLowerCase()}.`}</p>
              </div>
            </>
          )}

          {tab === "History" && <div className="space-y-2">{row.trend.map((v, i) => <div key={i} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"><span className="text-gray-500">Period {i + 1}</span><span className="font-medium text-gray-900">{v}</span></div>)}</div>}
          {tab === "Comments" && <p className="text-sm text-gray-400">No comments yet on this KPI.</p>}

          {tab === "Approval" && (
            isRegistryKpi ? (
              <RegistryApprovalPanel
                fallbackStatus={row.approval}
                persistedKpi={persistedKpi}
                approvalCase={approvalCase}
                approvalParticipantId={approvalParticipantId}
                setApprovalParticipantId={setApprovalParticipantId}
                submitDraft={submitDraft}
                publishApprovedDraft={publishApprovedDraft}
                submitBusy={submitForApproval.isPending}
                publishBusy={publish.isPending}
                notice={approvalNotice}
                error={approvalError}
              />
            ) : (
              <div className="rounded-lg border border-gray-100 p-4 text-sm"><p className="text-gray-500">Current approval status</p><p className="mt-1 font-semibold text-gray-900">{APPROVAL_LABEL[row.approval]}</p></div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function RegistryApprovalPanel({ fallbackStatus, persistedKpi, approvalCase, approvalParticipantId, setApprovalParticipantId, submitDraft, publishApprovedDraft, submitBusy, publishBusy, notice, error }: {
  fallbackStatus: KpiLibraryRow["approval"];
  persistedKpi: ReturnType<typeof trpc.registry.kpi.get.useQuery>;
  approvalCase: ReturnType<typeof trpc.governance.getLatestCaseForEntity.useQuery>;
  approvalParticipantId: string;
  setApprovalParticipantId: (value: string) => void;
  submitDraft: () => void;
  publishApprovedDraft: () => void;
  submitBusy: boolean;
  publishBusy: boolean;
  notice: string | null;
  error: string | null;
}) {
  if (persistedKpi.isLoading || approvalCase.isLoading) return <div className="flex items-center gap-2 rounded-lg border border-gray-100 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading approval workflow…</div>;
  if (persistedKpi.error || approvalCase.error) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message(persistedKpi.error ?? approvalCase.error)}</div>;

  const version = persistedKpi.data?.version;
  const latestCase = approvalCase.data;
  const published = Boolean(version?.publishedAt);
  const status = published ? "approved" : latestCase?.status ?? fallbackStatus;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-100 p-4 text-sm">
        <p className="text-gray-500">Current approval status</p>
        <p className="mt-1 font-semibold capitalize text-gray-900">{published ? "Published" : status.replace("_", " ")}</p>
        {latestCase && <p className="mt-2 break-all text-xs text-gray-400">Approval case: {latestCase.id}</p>}
      </div>

      {!published && !latestCase && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Submit this draft for approval</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">Choose the approval participant who should review this KPI. Approval must be completed by a different user before publication.</p>
          <input value={approvalParticipantId} onChange={(event) => setApprovalParticipantId(event.target.value)} placeholder="Approval participant UUID" className="mt-3 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400" />
          <button type="button" onClick={submitDraft} disabled={submitBusy || approvalParticipantId.trim().length === 0} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
            {submitBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for approval
          </button>
        </div>
      )}

      {!published && latestCase?.status === "pending" && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">This KPI is waiting for its assigned approver. Once approved, return here to publish it.</div>}
      {!published && latestCase?.status === "approved" && version && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Approval completed</p><p className="mt-1 text-xs text-emerald-700">The approved draft can now be published.</p><button type="button" onClick={publishApprovedDraft} disabled={publishBusy} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{publishBusy && <Loader2 className="h-4 w-4 animate-spin" />} Publish KPI</button></div>}
      {!published && latestCase && (latestCase.status === "rejected" || latestCase.status === "changes_requested") && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">This approval case was {latestCase.status === "rejected" ? "rejected" : "returned for changes"}. Review the governance decision before submitting a revised KPI version.</div>}
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function StatCard({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-1 text-base font-bold ${tone}`}>{value}</p></div>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between text-sm"><span className="text-gray-400">{label}</span><span className="font-medium text-gray-700">{children}</span></div>;
}
