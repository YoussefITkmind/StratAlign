"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleDot,
  FlaskConical,
  Link2,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type Comparator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
type Band = { label: string; color: string; comparator: Comparator; value: number };
type ThresholdDocument = {
  ruleType: "threshold_status";
  direction: "higher_is_better" | "lower_is_better";
  bands: Band[];
};

type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "changes_requested";

const initialDocument = (): ThresholdDocument => ({
  ruleType: "threshold_status",
  direction: "higher_is_better",
  bands: [
    { label: "On Track", color: "green", comparator: "gte", value: 100 },
    { label: "At Risk", color: "amber", comparator: "gte", value: 90 },
    { label: "Behind", color: "red", comparator: "lt", value: 90 },
  ],
});

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

const comparatorLabel: Record<Comparator, string> = {
  gte: "≥",
  gt: ">",
  lte: "≤",
  lt: "<",
  eq: "=",
  neq: "≠",
};

const approvalMeta: Record<ApprovalStatus, { label: string; className: string; dot: string }> = {
  draft: { label: "Draft", className: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  pending: { label: "Pending approval", className: "border-amber-200 bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  approved: { label: "Approved", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { label: "Rejected", className: "border-red-200 bg-red-50 text-red-700", dot: "bg-red-500" },
  changes_requested: { label: "Changes requested", className: "border-orange-200 bg-orange-50 text-orange-700", dot: "bg-orange-500" },
};

const bandMeta: Record<string, { bar: string; dot: string; soft: string }> = {
  green: { bar: "bg-emerald-500", dot: "bg-emerald-500", soft: "bg-emerald-50" },
  amber: { bar: "bg-amber-500", dot: "bg-amber-500", soft: "bg-amber-50" },
  red: { bar: "bg-red-500", dot: "bg-red-500", soft: "bg-red-50" },
  gray: { bar: "bg-slate-400", dot: "bg-slate-400", soft: "bg-slate-50" },
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

function shortId(value: string | null | undefined) {
  if (!value) return "—";
  return value.length <= 18 ? value : `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function RuleBuilderPanel() {
  const utils = trpc.useUtils();
  const kpis = trpc.registry.kpi.list.useQuery();
  const rules = trpc.rules.list.useQuery();
  const session = trpc.auth.session.useQuery();
  const approvers = trpc.governance.listApprovers.useQuery();
  const [kpiVersionId, setKpiVersionId] = useState("");
  const [document, setDocument] = useState<ThresholdDocument>(initialDocument);
  const [sampleValue, setSampleValue] = useState(95);
  const [approverId, setApproverId] = useState("");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ruleKey = kpiVersionId ? `kpi-threshold:${kpiVersionId}` : "";
  const rule = useMemo(
    () => rules.data?.find((candidate) => candidate.ruleKey === ruleKey && candidate.ruleType === "threshold_status"),
    [ruleKey, rules.data],
  );
  const selectedKpi = useMemo(
    () => kpis.data?.find((item) => item.version.id === kpiVersionId),
    [kpiVersionId, kpis.data],
  );
  const availableApprovers = useMemo(
    () => (approvers.data ?? []).filter((candidate) => candidate.id !== session.data?.user.id),
    [approvers.data, session.data?.user.id],
  );
  const effectiveApproverId = approverId || availableApprovers[0]?.id || "";

  const approval = trpc.governance.getLatestCaseForEntity.useQuery(
    { entityType: "RuleDefinition", entityId: rule?.id ?? "pending" },
    { enabled: Boolean(rule?.id) },
  );
  const binding = trpc.registry.kpi.getThresholdRuleBinding.useQuery(
    { kpiVersionId: kpiVersionId || "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(kpiVersionId) },
  );

  const refresh = async () => {
    await Promise.all([
      utils.rules.list.invalidate(),
      rule?.id
        ? utils.governance.getLatestCaseForEntity.invalidate({ entityType: "RuleDefinition", entityId: rule.id })
        : Promise.resolve(),
      kpiVersionId
        ? utils.registry.kpi.getThresholdRuleBinding.invalidate({ kpiVersionId })
        : Promise.resolve(),
    ]);
  };

  const create = trpc.rules.create.useMutation({
    onSuccess: async (created) => {
      setNotice(`Draft v${created.version} saved successfully.`);
      setPreviewResult(null);
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const preview = trpc.rules.preview.useMutation({
    onSuccess: (result) => {
      setPreviewResult(JSON.stringify(result));
      setError(null);
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const submit = trpc.governance.submit.useMutation({
    onSuccess: async () => {
      setNotice("Threshold rule submitted for governance approval.");
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const bind = trpc.registry.kpi.bindThresholdRule.useMutation({
    onSuccess: async () => {
      setNotice("Published threshold rule is now bound to this KPI version.");
      setError(null);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const publish = trpc.rules.publish.useMutation({
    onSuccess: async (published) => {
      await bind.mutateAsync({ kpiVersionId, thresholdRuleId: published.id });
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const storedDocument = rule?.document.ruleType === "threshold_status"
    ? (rule.document as ThresholdDocument)
    : null;
  const editable = !rule || rule.status === "published";
  const activeDocument = rule?.status === "draft" && storedDocument ? storedDocument : document;
  const currentApprovalStatus = (approval.data?.status ?? "draft") as ApprovalStatus;
  const approvalStatus = approvalMeta[currentApprovalStatus] ?? approvalMeta.draft;

  const setBand = (index: number, patch: Partial<Band>) =>
    setDocument((current) => ({
      ...current,
      bands: current.bands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, ...patch } : band,
      ),
    }));

  const selectKpi = (value: string) => {
    setKpiVersionId(value);
    setDocument(initialDocument());
    setPreviewResult(null);
    setApproverId("");
    setNotice(null);
    setError(null);
  };

  return (
    <div className="space-y-5" data-testid="canonical-rule-builder">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Threshold Rule Builder</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Define KPI performance bands, validate them against live values, and publish through the governed workflow.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          title="Reload persisted state"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </section>

      {notice && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[300px] flex-1">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">KPI version</span>
            <div className="relative">
              <select
                value={kpiVersionId}
                onChange={(event) => selectKpi(event.target.value)}
                className={`${inputClass} appearance-none pr-10 font-medium`}
              >
                <option value="">Select a persisted KPI version</option>
                {kpis.data?.map((item) => (
                  <option key={item.version.id} value={item.version.id}>
                    {item.version.nameEn} · v{item.version.version}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </label>
          {selectedKpi && (
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <CircleDot className="h-4 w-4 text-blue-500" />
              <span>{selectedKpi.version.frequency === "quarterly" ? "Quarterly" : "Monthly"}</span>
              <span className="text-slate-300">•</span>
              <span>{selectedKpi.version.unit}</span>
            </div>
          )}
        </div>
      </section>

      {!kpiVersionId && (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-base font-semibold text-slate-800">Select a KPI to configure thresholds</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Threshold rules are version-specific and remain governed independently from KPI measurements.
          </p>
        </section>
      )}

      {kpiVersionId && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">
                    {rule ? `${rule.name} · v${rule.version}` : "New threshold rule"}
                  </h2>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      rule?.status === "published"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : rule?.status === "draft"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {rule?.status === "published" ? "Published" : rule?.status === "draft" ? "Draft" : "Not persisted"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Configure the bands used to translate KPI values into performance status.
                </p>
              </div>
              <label className="min-w-[190px]">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Performance direction</span>
                <select
                  disabled={!editable}
                  value={activeDocument.direction}
                  onChange={(event) =>
                    setDocument((current) => ({
                      ...current,
                      direction: event.target.value as ThresholdDocument["direction"],
                    }))
                  }
                  className={`${inputClass} py-2`}
                >
                  <option value="higher_is_better">Higher is better</option>
                  <option value="lower_is_better">Lower is better</option>
                </select>
              </label>
            </div>

            <div className="p-5">
              <div className="mb-3 grid grid-cols-[minmax(150px,1fr)_120px_110px_120px_40px] gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 max-lg:hidden">
                <span>Status band</span>
                <span>Color</span>
                <span>Condition</span>
                <span>Threshold</span>
                <span />
              </div>

              <div className="space-y-3">
                {activeDocument.bands.map((band, index) => {
                  const visual = bandMeta[band.color] ?? bandMeta.gray;
                  return (
                    <div
                      key={`${index}-${band.label}`}
                      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <span className={`absolute inset-y-0 left-0 w-1 ${visual.bar}`} />
                      <div className="grid items-center gap-3 pl-2 lg:grid-cols-[minmax(150px,1fr)_120px_110px_120px_40px]">
                        <div className="relative">
                          <span className={`pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${visual.dot}`} />
                          <input
                            disabled={!editable}
                            value={band.label}
                            onChange={(event) => setBand(index, { label: event.target.value })}
                            className={`${inputClass} pl-8 font-medium`}
                            aria-label={`Band ${index + 1} label`}
                          />
                        </div>
                        <select
                          disabled={!editable}
                          value={band.color}
                          onChange={(event) => setBand(index, { color: event.target.value })}
                          className={inputClass}
                          aria-label={`Band ${index + 1} color`}
                        >
                          <option value="green">Green</option>
                          <option value="amber">Amber</option>
                          <option value="red">Red</option>
                          <option value="gray">Neutral</option>
                        </select>
                        <select
                          disabled={!editable}
                          value={band.comparator}
                          onChange={(event) => setBand(index, { comparator: event.target.value as Comparator })}
                          className={`${inputClass} font-semibold`}
                          aria-label={`Band ${index + 1} comparator`}
                        >
                          {(["gte", "gt", "lte", "lt", "eq", "neq"] as Comparator[]).map((value) => (
                            <option key={value} value={value}>{comparatorLabel[value]} {value}</option>
                          ))}
                        </select>
                        <input
                          disabled={!editable}
                          type="number"
                          value={band.value}
                          onChange={(event) => setBand(index, { value: Number(event.target.value) })}
                          className={`${inputClass} font-semibold tabular-nums`}
                          aria-label={`Band ${index + 1} threshold`}
                        />
                        {editable ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDocument((current) => ({
                                ...current,
                                bands: current.bands.filter((_, bandIndex) => bandIndex !== index),
                              }))
                            }
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            title={`Delete ${band.label}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {editable && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDocument((current) => ({
                        ...current,
                        bands: [
                          ...current.bands,
                          { label: "New Band", color: "gray", comparator: "gte", value: 0 },
                        ],
                      }))
                    }
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" /> Add band
                  </button>
                  <button
                    type="button"
                    disabled={create.isPending || activeDocument.bands.length === 0}
                    onClick={() => create.mutate({ ruleKey, name: `Thresholds for ${selectedKpi?.version.nameEn ?? kpiVersionId}`, document })}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" /> {create.isPending ? "Saving…" : "Save draft"}
                  </button>
                </div>
              )}
            </div>

            {rule?.status === "draft" && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-slate-900">Validate before governance</h3>
                    <p className="mt-0.5 text-xs text-slate-500">Run the persisted rule against a sample KPI value before submitting it.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        type="number"
                        value={sampleValue}
                        onChange={(event) => setSampleValue(Number(event.target.value))}
                        className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold tabular-nums outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        aria-label="Sample KPI value"
                      />
                      <button
                        type="button"
                        disabled={preview.isPending}
                        onClick={() => preview.mutate({ draftDocument: activeDocument, sampleData: { value: sampleValue } })}
                        className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-40"
                      >
                        <FlaskConical className="h-4 w-4" /> {preview.isPending ? "Evaluating…" : "Run preview"}
                      </button>
                    </div>
                    {previewResult && (
                      <div data-testid="backend-preview-result" className="mt-3 rounded-xl border border-violet-100 bg-white px-3 py-2.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500">Preview result</p>
                        <p className="mt-1 break-words font-mono text-xs text-slate-700">{previewResult}</p>
                      </div>
                    )}

                    {previewResult && !approval.data && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="min-w-[220px] flex-1">
                            <span className="mb-1.5 block text-xs font-semibold text-amber-900">Governance approver</span>
                            <div className="relative">
                              <select
                                value={effectiveApproverId}
                                onChange={(event) => setApproverId(event.target.value)}
                                disabled={approvers.isLoading || availableApprovers.length === 0}
                                className="w-full appearance-none rounded-xl border border-amber-200 bg-white px-3 py-2.5 pr-9 text-sm text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:opacity-60"
                              >
                                {availableApprovers.length === 0 && <option value="">No other users available</option>}
                                {availableApprovers.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                            </div>
                          </label>
                          <button
                            type="button"
                            disabled={!effectiveApproverId || submit.isPending}
                            onClick={() =>
                              submit.mutate({
                                entityType: "RuleDefinition",
                                entityId: rule.id,
                                approvalParticipantId: effectiveApproverId,
                                proposedChange: {
                                  before: {},
                                  after: activeDocument,
                                  impactSummary: "Publish KPI threshold rule",
                                },
                              })
                            }
                            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Send className="h-4 w-4" /> {submit.isPending ? "Submitting…" : "Submit for approval"}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-amber-700">The rule author cannot approve their own submission.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Governance workflow</h2>
                  <p className="text-xs text-slate-500">Approval and publication state</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3">
                  <span className="text-xs font-medium text-slate-500">Approval</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${approvalStatus.className}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${approvalStatus.dot}`} />
                    {approval.data ? approvalStatus.label : "Not submitted"}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Approval case</p>
                  <p className="mt-1 font-mono text-xs font-medium text-slate-700" title={approval.data?.id ?? undefined}>{shortId(approval.data?.id)}</p>
                </div>
                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-slate-400" />
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">KPI binding</p>
                  </div>
                  {binding.data ? (
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-slate-800">Bound to published rule</p>
                      <p className="mt-0.5 text-xs text-slate-500">Rule version {binding.data.ruleVersion}</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No published rule is bound yet.</p>
                  )}
                </div>
              </div>

              {rule?.status === "draft" && approval.data?.status === "approved" && (
                <button
                  type="button"
                  disabled={publish.isPending || bind.isPending}
                  onClick={() => publish.mutate({ ruleId: rule.id, approvalCaseId: approval.data!.id })}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {publish.isPending || bind.isPending ? "Publishing…" : "Publish & bind rule"}
                </button>
              )}
              {rule?.status === "published" && !binding.data && (
                <button
                  type="button"
                  disabled={bind.isPending}
                  onClick={() => bind.mutate({ kpiVersionId, thresholdRuleId: rule.id })}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                >
                  <Link2 className="h-4 w-4" /> {bind.isPending ? "Binding…" : "Bind published rule"}
                </button>
              )}
            </section>

            <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Workflow</p>
              <div className="mt-3 space-y-2.5 text-xs text-blue-900">
                <WorkflowStep complete={Boolean(rule)} number="1" label="Save threshold draft" />
                <WorkflowStep complete={Boolean(previewResult)} number="2" label="Validate with backend preview" />
                <WorkflowStep complete={Boolean(approval.data)} number="3" label="Governance approval" />
                <WorkflowStep complete={Boolean(binding.data)} number="4" label="Publish and bind to KPI" />
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function WorkflowStep({ complete, number, label }: { complete: boolean; number: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-blue-600 text-white" : "border border-blue-200 bg-white text-blue-500"}`}>
        {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : number}
      </span>
      <span className={complete ? "font-medium" : "text-blue-700/70"}>{label}</span>
    </div>
  );
}
