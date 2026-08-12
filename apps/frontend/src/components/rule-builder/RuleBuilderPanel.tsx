"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type Comparator = "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
type Band = { label: string; color: string; comparator: Comparator; value: number };
type ThresholdDocument = {
  ruleType: "threshold_status";
  direction: "higher_is_better" | "lower_is_better";
  bands: Band[];
};

const initialDocument = (): ThresholdDocument => ({
  ruleType: "threshold_status",
  direction: "higher_is_better",
  bands: [
    { label: "On Track", color: "green", comparator: "gte", value: 100 },
    { label: "At Risk", color: "amber", comparator: "gte", value: 90 },
    { label: "Behind", color: "red", comparator: "lt", value: 90 },
  ],
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export function RuleBuilderPanel() {
  const utils = trpc.useUtils();
  const kpis = trpc.registry.kpi.list.useQuery();
  const rules = trpc.rules.list.useQuery();
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
      rule?.id ? utils.governance.getLatestCaseForEntity.invalidate({ entityType: "RuleDefinition", entityId: rule.id }) : Promise.resolve(),
      kpiVersionId ? utils.registry.kpi.getThresholdRuleBinding.invalidate({ kpiVersionId }) : Promise.resolve(),
    ]);
  };
  const create = trpc.rules.create.useMutation({
    onSuccess: async (created) => {
      setNotice(`Draft v${created.version} persisted.`);
      setPreviewResult(null);
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
    onSuccess: async (approvalCase) => {
      setNotice(`Submitted for approval. Case: ${approvalCase.id}`);
      await refresh();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const bind = trpc.registry.kpi.bindThresholdRule.useMutation({
    onSuccess: async () => { setNotice("Published threshold rule bound to the KPI version."); await refresh(); },
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
    ? rule.document as ThresholdDocument
    : null;
  const editable = !rule || rule.status === "published";
  const activeDocument = rule?.status === "draft" && storedDocument ? storedDocument : document;
  const setBand = (index: number, patch: Partial<Band>) => setDocument((current) => ({
    ...current,
    bands: current.bands.map((band, bandIndex) => bandIndex === index ? { ...band, ...patch } : band),
  }));

  return <div className="space-y-4" data-testid="canonical-rule-builder">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-slate-900">Threshold Rule Builder</h1><p className="text-sm text-slate-500">Canonical Rules evaluation and governed publication</p></div>
      <button onClick={() => void refresh()} className="rounded-lg border p-2" title="Reload persisted state"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <label className="block text-sm">KPI version<select value={kpiVersionId} onChange={(event) => { setKpiVersionId(event.target.value); setPreviewResult(null); setNotice(null); }} className="mt-1 w-full rounded-lg border p-2"><option value="">Select persisted KPI version</option>{kpis.data?.map((item) => <option key={item.version.id} value={item.version.id}>{item.version.nameEn} · v{item.version.version}</option>)}</select></label>
    {kpiVersionId && <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border bg-white p-5">
        <div className="mb-3 flex justify-between"><h2 className="font-semibold">{rule ? `${rule.name} · v${rule.version}` : "New threshold rule"}</h2><span className="text-sm text-slate-500">{rule?.status ?? "not persisted"}</span></div>
        <label className="text-sm">Direction<select disabled={!editable} value={activeDocument.direction} onChange={(event) => setDocument((current) => ({ ...current, direction: event.target.value as ThresholdDocument["direction"] }))} className="ml-2 rounded border p-1"><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
        <div className="mt-3 space-y-2">{activeDocument.bands.map((band, index) => <div key={`${index}-${band.label}`} className="flex flex-wrap gap-2 rounded border p-2"><input disabled={!editable} value={band.label} onChange={(event) => setBand(index, { label: event.target.value })} className="w-32 rounded border px-2" /><input disabled={!editable} value={band.color} onChange={(event) => setBand(index, { color: event.target.value })} className="w-24 rounded border px-2" /><select disabled={!editable} value={band.comparator} onChange={(event) => setBand(index, { comparator: event.target.value as Comparator })} className="rounded border px-2">{["gte", "gt", "lte", "lt", "eq", "neq"].map((value) => <option key={value} value={value}>{value}</option>)}</select><input disabled={!editable} type="number" value={band.value} onChange={(event) => setBand(index, { value: Number(event.target.value) })} className="w-24 rounded border px-2" />{editable && <button onClick={() => setDocument((current) => ({ ...current, bands: current.bands.filter((_, bandIndex) => bandIndex !== index) }))}><Trash2 className="h-4 w-4 text-red-500" /></button>}</div>)}</div>
        {editable && <div className="mt-3 flex gap-2"><button onClick={() => setDocument((current) => ({ ...current, bands: [...current.bands, { label: "New Band", color: "gray", comparator: "gte", value: 0 }] }))} className="flex items-center gap-1 rounded border px-3 py-2 text-sm"><Plus className="h-4 w-4" /> Band</button><button disabled={create.isPending} onClick={() => create.mutate({ ruleKey, name: `Thresholds for ${kpiVersionId}`, document })} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">Persist draft</button></div>}
        {rule?.status === "draft" && <div className="mt-4 border-t pt-4"><div className="flex gap-2"><input type="number" value={sampleValue} onChange={(event) => setSampleValue(Number(event.target.value))} className="w-28 rounded border px-2" /><button onClick={() => preview.mutate({ draftDocument: activeDocument, sampleData: { value: sampleValue } })} className="rounded bg-slate-700 px-3 py-2 text-sm text-white">Backend preview</button></div>{previewResult && <p data-testid="backend-preview-result" className="mt-2 text-sm text-slate-600">{previewResult}</p>}{previewResult && !approval.data && <div className="mt-3 flex gap-2"><input value={approverId} onChange={(event) => setApproverId(event.target.value)} placeholder="Different approver UUID" className="min-w-0 flex-1 rounded border px-2" /><button disabled={!approverId || submit.isPending} onClick={() => submit.mutate({ entityType: "RuleDefinition", entityId: rule.id, approvalParticipantId: approverId, proposedChange: { before: {}, after: activeDocument, impactSummary: "Publish KPI threshold rule" } })} className="flex items-center gap-1 rounded bg-amber-600 px-3 py-2 text-sm text-white"><Send className="h-4 w-4" /> Submit</button></div>}</div>}
      </div>
      <aside className="space-y-3 rounded-xl border bg-white p-4 text-sm"><h2 className="font-semibold">Persisted workflow</h2><p>Approval: <b>{approval.data?.status ?? "not submitted"}</b></p><p className="break-all">Case: {approval.data?.id ?? "—"}</p><p>Binding: <b>{binding.data ? `${binding.data.ruleKey} v${binding.data.ruleVersion}` : "none"}</b></p>{rule?.status === "draft" && approval.data?.status === "approved" && <button disabled={publish.isPending || bind.isPending} onClick={() => publish.mutate({ ruleId: rule.id, approvalCaseId: approval.data!.id })} className="flex w-full items-center justify-center gap-1 rounded bg-emerald-600 px-3 py-2 text-white"><CheckCircle2 className="h-4 w-4" /> Publish & bind</button>}{rule?.status === "published" && !binding.data && <button onClick={() => bind.mutate({ kpiVersionId, thresholdRuleId: rule.id })} className="w-full rounded bg-slate-900 px-3 py-2 text-white">Bind published rule</button>}</aside>
    </div>}
  </div>;
}
