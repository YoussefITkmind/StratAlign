"use client";

import { useState } from "react";
import { Archive, Check, Link2, Plus, RefreshCw, Save, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type KpiDraft = {
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  unit: string;
  polarity: "higher_is_better" | "lower_is_better";
  frequency: "monthly" | "quarterly";
  dataSourceType: "manual" | "feed";
  calculationLogicText: string;
  ownerUserId: string;
  stewardUserId: string;
  activeFrom: string;
  approvalParticipantId: string;
};

const emptyDraft = (): KpiDraft => ({
  nameEn: "", nameAr: "", descriptionEn: "", descriptionAr: "", unit: "%",
  polarity: "higher_is_better", frequency: "monthly", dataSourceType: "manual",
  calculationLogicText: "", ownerUserId: "", stewardUserId: "",
  activeFrom: new Date().toISOString().slice(0, 10), approvalParticipantId: "",
});

function message(error: unknown) {
  return error instanceof Error ? error.message : "The operation could not be completed.";
}

export function KpiRegistryPanel() {
  const utils = trpc.useUtils();
  const list = trpc.registry.kpi.list.useQuery();
  const nodes = trpc.registry.strategyNodes.useQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = trpc.registry.kpi.get.useQuery(
    { kpiDefinitionId: selectedId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: selectedId !== null },
  );
  const versions = trpc.registry.kpi.listVersions.useQuery(
    { kpiDefinitionId: selectedId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: selectedId !== null },
  );
  const impact = trpc.registry.kpi.retirementImpact.useQuery(
    { kpiDefinitionId: selectedId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: selectedId !== null },
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<KpiDraft>(emptyDraft);
  const [approvalCaseId, setApprovalCaseId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alignmentDraft, setAlignmentDraft] = useState<string[] | null>(null);
  const alignedIds = alignmentDraft ?? impact.data?.affectedStrategyNodeIds ?? [];
  const alignmentNodes = nodes.data?.filter((node) =>
    node.type === "objective" || node.type === "strategic_play" || node.type === "area_of_focus",
  );

  const refresh = async () => {
    await Promise.all([
      utils.registry.kpi.list.invalidate(),
      selectedId ? utils.registry.kpi.get.invalidate({ kpiDefinitionId: selectedId }) : Promise.resolve(),
      selectedId ? utils.registry.kpi.listVersions.invalidate({ kpiDefinitionId: selectedId }) : Promise.resolve(),
      selectedId ? utils.registry.kpi.retirementImpact.invalidate({ kpiDefinitionId: selectedId }) : Promise.resolve(),
    ]);
  };

  const submitGovernance = trpc.governance.submit.useMutation();
  const createDraft = trpc.registry.kpi.createDraft.useMutation({
    onSuccess: async (created) => {
      const workflow = await submitGovernance.mutateAsync({
        entityType: "KpiDefinition",
        entityId: created.definition.id,
        approvalParticipantId: draft.approvalParticipantId,
        proposedChange: {
          before: selected.data?.version ?? null,
          after: created.version,
          impactSummary: selectedId ? "KPI definition version change" : "New KPI definition",
        },
      });
      setApprovalCaseId(workflow.id);
      setNotice(`Draft v${created.version.version} persisted and submitted for approval. Case: ${workflow.id}`);
      setSelectedId(created.definition.id);
      setEditing(false);
      await refresh();
    },
    onError: (cause) => setError(message(cause)),
  });
  const publish = trpc.registry.kpi.publishVersion.useMutation({
    onSuccess: async () => { setNotice("Approved KPI version published."); await refresh(); },
    onError: (cause) => setError(message(cause)),
  });
  const retire = trpc.registry.kpi.retire.useMutation({
    onSuccess: async () => { setNotice("KPI retirement persisted."); await refresh(); },
    onError: (cause) => setError(message(cause)),
  });
  const align = trpc.registry.alignment.set.useMutation({
    onSuccess: async () => { setNotice("Strategy alignment persisted."); await refresh(); },
    onError: (cause) => setError(message(cause)),
  });

  const openCreate = () => { setSelectedId(null); setDraft(emptyDraft()); setEditing(true); setError(null); };
  const openEdit = () => {
    const value = selected.data?.version;
    if (!value) return;
    setDraft({
      nameEn: value.nameEn, nameAr: value.nameAr,
      descriptionEn: value.descriptionEn ?? "", descriptionAr: value.descriptionAr ?? "",
      unit: value.unit, polarity: value.polarity, frequency: value.frequency,
      dataSourceType: value.dataSourceType,
      calculationLogicText: value.calculationLogicText ?? "",
      ownerUserId: value.ownerUserId, stewardUserId: value.stewardUserId ?? "",
      activeFrom: new Date(value.activeFrom).toISOString().slice(0, 10), approvalParticipantId: "",
    });
    setEditing(true); setError(null);
  };
  const saveDraft = () => {
    setError(null);
    createDraft.mutate({
      ...(selectedId ? { kpiDefinitionId: selectedId } : {}),
      nameEn: draft.nameEn, nameAr: draft.nameAr,
      descriptionEn: draft.descriptionEn || null, descriptionAr: draft.descriptionAr || null,
      unit: draft.unit, polarity: draft.polarity, frequency: draft.frequency,
      dataSourceType: draft.dataSourceType,
      calculationLogicText: draft.calculationLogicText || null,
      ownerUserId: draft.ownerUserId,
      stewardUserId: draft.stewardUserId || null,
      activeFrom: new Date(`${draft.activeFrom}T00:00:00.000Z`),
    });
  };

  if (editing) return <KpiForm draft={draft} setDraft={setDraft} onCancel={() => setEditing(false)} onSave={saveDraft} busy={createDraft.isPending || submitGovernance.isPending} error={error} />;

  return (
    <div className="space-y-4" data-testid="registry-kpi-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-900">KPI Registry</h1><p className="text-sm text-slate-500">Persisted definitions and immutable versions</p></div>
        <div className="flex gap-2"><button onClick={() => void refresh()} className="rounded-lg border p-2" title="Reload"><RefreshCw className="h-4 w-4" /></button><button onClick={openCreate} className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Create KPI</button></div>
      </div>
      {notice && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {list.isLoading && <p className="text-sm text-slate-500">Loading persisted KPIs…</p>}
      {list.error && <p className="text-sm text-red-600">{message(list.error)}</p>}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-2">
          {list.data?.map((item) => <button key={item.definition.id} data-testid="persisted-kpi-row" onClick={() => { setSelectedId(item.definition.id); setApprovalCaseId(""); setAlignmentDraft(null); }} className={`w-full rounded-xl border p-3 text-left ${selectedId === item.definition.id ? "border-blue-500 bg-blue-50" : "bg-white"}`}><div className="font-semibold text-slate-900">{item.version.nameEn}</div><div className="mt-1 text-xs text-slate-500">v{item.version.version} · {item.definition.status} · {item.version.frequency}</div></button>)}
          {list.data?.length === 0 && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">No persisted KPIs.</p>}
        </div>
        {selected.data ? <div className="space-y-4 rounded-xl border bg-white p-5">
          <div className="flex justify-between gap-3"><div><h2 className="text-lg font-bold">{selected.data.version.nameEn}</h2><p dir="rtl" className="text-sm text-slate-500">{selected.data.version.nameAr}</p></div><div className="flex gap-2"><button onClick={openEdit} className="rounded-lg border px-3 py-2 text-sm">New version</button>{selected.data.definition.status !== "retired" && <button onClick={() => { if (confirm("Retire this KPI and preserve its history?")) retire.mutate({ kpiDefinitionId: selected.data!.definition.id }); }} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"><Archive className="h-4 w-4" /> Retire</button>}</div></div>
          <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Unit</dt><dd>{selected.data.version.unit}</dd></div><div><dt className="text-slate-400">Source</dt><dd>{selected.data.version.dataSourceType}</dd></div><div><dt className="text-slate-400">Owner ID</dt><dd className="break-all">{selected.data.version.ownerUserId}</dd></div><div><dt className="text-slate-400">Published</dt><dd>{selected.data.version.publishedAt ? "Yes" : "Draft"}</dd></div></dl>
          {!selected.data.version.publishedAt && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-900">Governed publication</p><p className="mb-2 text-xs text-amber-700">Approval must be completed by a different user. Publication always calls the approval-gated backend operation.</p><div className="flex gap-2"><input value={approvalCaseId} onChange={(e) => setApprovalCaseId(e.target.value)} placeholder="Approved case UUID" className="min-w-0 flex-1 rounded border px-3 py-2 text-sm" /><button disabled={!approvalCaseId || publish.isPending} onClick={() => publish.mutate({ kpiVersionId: selected.data!.version.id, approvalCaseId })} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40"><Check className="inline h-4 w-4" /> Publish</button></div></div>}
          <div><h3 className="mb-2 flex items-center gap-1 text-sm font-semibold"><Link2 className="h-4 w-4" /> Strategy alignment</h3><div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">{alignmentNodes?.map((node) => <label key={node.id} className="flex gap-2 p-1 text-sm"><input type="checkbox" checked={alignedIds.includes(node.id)} onChange={() => setAlignmentDraft(alignedIds.includes(node.id) ? alignedIds.filter((id) => id !== node.id) : [...alignedIds, node.id])} /> <span>{node.nameEn} <span className="text-xs text-slate-400">({node.type})</span></span></label>)}</div><button onClick={() => align.mutate({ kpiDefinitionId: selected.data!.definition.id, alignments: alignedIds.map((strategyNodeId) => { const type = alignmentNodes?.find((node) => node.id === strategyNodeId)?.type; return { strategyNodeId, alignmentType: type === "strategic_play" ? "play" as const : type === "area_of_focus" ? "sector" as const : "objective" as const }; }) })} className="mt-2 flex items-center gap-1 rounded bg-slate-900 px-3 py-2 text-sm text-white"><Save className="h-4 w-4" /> Save alignment</button></div>
          <div><h3 className="mb-2 text-sm font-semibold">Version history</h3>{versions.data?.slice().reverse().map((version) => <div key={version.id} className="border-t py-2 text-sm"><b>v{version.version}</b> · {version.publishedAt ? "published" : "draft"} · {new Date(version.createdAt).toLocaleString()}</div>)}</div>
        </div> : <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-400">Select a KPI.</div>}
      </div>
    </div>
  );
}

function KpiForm({ draft, setDraft, onCancel, onSave, busy, error }: { draft: KpiDraft; setDraft: React.Dispatch<React.SetStateAction<KpiDraft>>; onCancel: () => void; onSave: () => void; busy: boolean; error: string | null }) {
  const set = <K extends keyof KpiDraft>(key: K, value: KpiDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const valid = draft.nameEn && draft.nameAr && draft.unit && draft.ownerUserId && draft.approvalParticipantId;
  return <div className="mx-auto max-w-3xl rounded-xl border bg-white p-6"><div className="mb-4 flex justify-between"><h2 className="text-lg font-bold">Persist KPI draft</h2><button onClick={onCancel}><X className="h-5 w-5" /></button></div>{error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}<div className="grid gap-3 md:grid-cols-2">
    <Input label="Name (English)" value={draft.nameEn} onChange={(v) => set("nameEn", v)} /><Input label="Name (Arabic)" value={draft.nameAr} onChange={(v) => set("nameAr", v)} />
    <Input label="Description (English)" value={draft.descriptionEn} onChange={(v) => set("descriptionEn", v)} /><Input label="Description (Arabic)" value={draft.descriptionAr} onChange={(v) => set("descriptionAr", v)} />
    <Input label="Unit" value={draft.unit} onChange={(v) => set("unit", v)} /><Input label="Calculation logic" value={draft.calculationLogicText} onChange={(v) => set("calculationLogicText", v)} />
    <label className="text-sm">Polarity<select value={draft.polarity} onChange={(e) => set("polarity", e.target.value as KpiDraft["polarity"])} className="mt-1 w-full rounded border p-2"><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></label>
    <label className="text-sm">Frequency<select value={draft.frequency} onChange={(e) => set("frequency", e.target.value as KpiDraft["frequency"])} className="mt-1 w-full rounded border p-2"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></label>
    <label className="text-sm">Data source<select value={draft.dataSourceType} onChange={(e) => set("dataSourceType", e.target.value as KpiDraft["dataSourceType"])} className="mt-1 w-full rounded border p-2"><option value="manual">Manual</option><option value="feed">Feed</option></select></label>
    <label className="text-sm">Active from<input type="date" value={draft.activeFrom} onChange={(e) => set("activeFrom", e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
    <Input label="Owner user UUID" value={draft.ownerUserId} onChange={(v) => set("ownerUserId", v)} /><Input label="Steward user UUID (optional)" value={draft.stewardUserId} onChange={(v) => set("stewardUserId", v)} />
    <Input label="Different approver user UUID" value={draft.approvalParticipantId} onChange={(v) => set("approvalParticipantId", v)} />
  </div><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded border px-4 py-2 text-sm">Cancel</button><button disabled={!valid || busy} onClick={onSave} className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? "Saving…" : "Save & submit for approval"}</button></div></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm">{label}<input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>; }

export function OkrRegistryPanel() {
  const utils = trpc.useUtils();
  const list = trpc.registry.okr.list.useQuery();
  const nodes = trpc.registry.strategyNodes.useQuery();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ objectiveNodeId: "", nameEn: "", nameAr: "", targetValue: 100, unit: "%" });
  const create = trpc.registry.okr.create.useMutation({ onSuccess: async () => { setOpen(false); await utils.registry.okr.list.invalidate(); } });
  return <div className="space-y-4"><div className="flex justify-between"><div><h1 className="text-xl font-bold">OKR Registry</h1><p className="text-sm text-slate-500">Persisted objectives and key results</p></div><button onClick={() => setOpen(true)} className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm text-white"><Plus className="h-4 w-4" /> Create OKR</button></div>{list.data?.map((okr) => <div key={okr.id} data-testid="persisted-okr-row" className="rounded-xl border bg-white p-4"><h2 className="font-semibold">{okr.nameEn}</h2><p dir="rtl" className="text-sm text-slate-500">{okr.nameAr}</p><p className="mt-2 text-xs text-slate-400">{okr.keyResults.length} key result(s) · strategy node {okr.objectiveNodeId}</p></div>)}{open && <div className="rounded-xl border bg-white p-5"><div className="grid gap-3 md:grid-cols-2"><label className="text-sm">Objective<select value={form.objectiveNodeId} onChange={(e) => setForm({ ...form, objectiveNodeId: e.target.value })} className="mt-1 w-full rounded border p-2"><option value="">Select persisted objective</option>{nodes.data?.filter((n) => n.type === "objective").map((n) => <option key={n.id} value={n.id}>{n.nameEn}</option>)}</select></label><Input label="Name (English)" value={form.nameEn} onChange={(nameEn) => setForm({ ...form, nameEn })} /><Input label="Name (Arabic)" value={form.nameAr} onChange={(nameAr) => setForm({ ...form, nameAr })} /><Input label="Unit" value={form.unit} onChange={(unit) => setForm({ ...form, unit })} /><label className="text-sm">Target<input type="number" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: Number(e.target.value) })} className="mt-1 w-full rounded border p-2" /></label></div>{create.error && <p className="mt-3 text-sm text-red-600">{message(create.error)}</p>}<div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded border px-3 py-2">Cancel</button><button onClick={() => create.mutate({ objectiveNodeId: form.objectiveNodeId, nameEn: form.nameEn, nameAr: form.nameAr, keyResults: [{ type: "quantitative", targetValue: form.targetValue, unit: form.unit }] })} className="rounded bg-slate-900 px-3 py-2 text-white">Persist OKR</button></div></div>}</div>;
}
