"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowUpDown, Check, ChevronDown, Clock, Pencil, Plus, Search, TrendingUp, Users, X, Zap } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { KpiApproval, KpiLibraryRow, KpiPerspective, KpiStatus, ObjectiveOption } from "@/types/kpi-workspace";
import KpiDetailDrawer from "./KpiDetailDrawer";

export const PERSPECTIVE_META: Record<KpiPerspective, { label: string; icon: typeof TrendingUp; text: string }> = {
  financial: { label: "Financial", icon: TrendingUp, text: "text-blue-600" },
  customer: { label: "Customer", icon: Users, text: "text-teal-600" },
  internal: { label: "Internal", icon: Activity, text: "text-orange-600" },
  learning: { label: "Learning", icon: Zap, text: "text-violet-600" },
};

const STATUS_META: Record<KpiStatus, { label: string; dot: string; bg: string; text: string }> = {
  "on-track": { label: "On Track", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  "at-risk": { label: "At Risk", dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
  behind: { label: "Behind", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
};

const APPROVAL_META: Record<KpiApproval, { label: string; icon: typeof Check; bg: string; text: string; border: string }> = {
  draft: { label: "Draft", icon: Pencil, bg: "bg-white", text: "text-gray-600", border: "border-gray-300" },
  pending: { label: "Pending", icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  changes_requested: { label: "Changes Requested", icon: Pencil, bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  rejected: { label: "Rejected", icon: X, bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  approved: { label: "Approved", icon: Check, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

const inputClass = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="text-xs text-gray-300">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 60},${20 - ((value - min) / range) * 18 - 1}`).join(" ");
  return <svg width="64" height="22" viewBox="0 0 64 22" className="shrink-0"><polyline points={points} fill="none" strokeWidth="1.75" className={color} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HeaderCell({ label }: { label: string }) {
  return <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}<ArrowUpDown className="h-3 w-3 text-gray-300" /></div>;
}

export function KpiStatusBadges({ rows }: { rows: KpiLibraryRow[] }) {
  const counts = rows.reduce((result, row) => ({ ...result, [row.status]: result[row.status] + 1 }), { "on-track": 0, "at-risk": 0, behind: 0 } as Record<KpiStatus, number>);
  return <>{(["on-track", "at-risk", "behind"] as KpiStatus[]).map((status) => { const meta = STATUS_META[status]; return <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${meta.bg} ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{counts[status]} {meta.label}</span>; })}</>;
}

export default function PersistedKpiLibraryTable({ rows, objectives, onRefresh }: { rows: KpiLibraryRow[]; objectives: ObjectiveOption[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [perspective, setPerspective] = useState<"all" | KpiPerspective>("all");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | KpiStatus>("all");
  const [approval, setApproval] = useState<"all" | KpiApproval>("all");
  const [selectedKpi, setSelectedKpi] = useState<KpiLibraryRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (perspective !== "all" && row.perspective !== perspective) return false;
    if (department !== "all" && row.department !== department) return false;
    if (status !== "all" && row.status !== status) return false;
    if (approval !== "all" && row.approval !== approval) return false;
    return !search.trim() || `${row.name} ${row.tag}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [rows, perspective, department, status, approval, search]);

  return <div className="rounded-2xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
      <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search KPIs..." className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" /></div>
      {(["all", "financial", "customer", "internal", "learning"] as const).map((key) => <button key={key} type="button" onClick={() => setPerspective(key)} className={`rounded-full px-3 py-2 text-sm font-medium ${perspective === key ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600"}`}>{key === "all" ? "All" : PERSPECTIVE_META[key].label}</button>)}
      <Select value={department} onChange={setDepartment} placeholder="All Departments" values={departments} />
      <Select value={status} onChange={(value) => setStatus(value as typeof status)} placeholder="All Status" values={["on-track", "at-risk", "behind"]} labels={["On Track", "At Risk", "Behind"]} />
      <Select value={approval} onChange={(value) => setApproval(value as typeof approval)} placeholder="All Approvals" values={["draft", "pending", "changes_requested", "rejected", "approved"]} labels={["Draft", "Pending", "Changes Requested", "Rejected", "Approved"]} />
      <button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"><Plus className="h-4 w-4" /> Add KPI</button>
      <span className="ml-auto text-sm text-gray-500">{filtered.length} KPIs</span>
    </div>

    <div className="overflow-x-auto">
      <div className="min-w-[1100px]">
        <div className="grid grid-cols-[5px_minmax(180px,2.2fr)_120px_130px_48px_80px_80px_85px_80px_90px_105px_105px] items-center gap-3 border-b border-gray-100 px-4 py-2.5">
          <div /><HeaderCell label="KPI Name" /><HeaderCell label="Perspective" /><HeaderCell label="Department" /><div /><HeaderCell label="Actual" /><HeaderCell label="Target" /><HeaderCell label="Variance" /><span className="text-[11px] font-semibold uppercase text-gray-400">Trend</span><HeaderCell label="Freq" /><span className="text-[11px] font-semibold uppercase text-gray-400">Approval</span><span className="text-[11px] font-semibold uppercase text-gray-400">Status</span>
        </div>
        {filtered.map((row) => { const p = PERSPECTIVE_META[row.perspective]; const s = STATUS_META[row.status]; const a = APPROVAL_META[row.approval]; const Icon = p.icon; const ApprovalIcon = a.icon; return <button type="button" key={row.id} onClick={() => setSelectedKpi(row)} className="grid w-full grid-cols-[5px_minmax(180px,2.2fr)_120px_130px_48px_80px_80px_85px_80px_90px_105px_105px] items-center gap-3 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50">
          <span className={`h-8 w-1 rounded-full ${s.dot}`} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-900">{row.name}</p><p className={`truncate text-xs ${p.text}`}>{row.tag}</p></div><span className={`flex items-center gap-1 text-sm ${p.text}`}><Icon className="h-3.5 w-3.5" />{p.label}</span><span className="truncate text-sm text-gray-600">{row.department}</span><span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ${row.owner.color}`}>{row.owner.initials}</span><span className="text-sm font-semibold">{row.actual}</span><span className="text-sm text-gray-600">{row.target}</span><span className={`text-sm font-medium ${row.favorable ? "text-emerald-600" : "text-red-500"}`}>{row.variance}</span><Sparkline values={row.trend} color={p.text} /><span className="text-sm text-gray-600">{row.freq}</span><span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-xs ${a.bg} ${a.text} ${a.border}`}><ApprovalIcon className="h-3 w-3" />{a.label}</span><span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-xs ${s.bg} ${s.text}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</span>
        </button>; })}
        {filtered.length === 0 && <p className="p-10 text-center text-sm text-gray-400">No persisted KPIs match these filters.</p>}
      </div>
    </div>

    {selectedKpi && <KpiDetailDrawer row={selectedKpi} onClose={() => setSelectedKpi(null)} />}
    {showCreate && <CreatePersistedKpiModal objectives={objectives} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await onRefresh(); }} />}
  </div>;
}

function CreatePersistedKpiModal({ objectives, onClose, onSaved }: { objectives: ObjectiveOption[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const session = trpc.auth.session.useQuery();
  const createDraft = trpc.registry.kpi.createDraft.useMutation();
  const align = trpc.registry.alignment.set.useMutation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objectiveId, setObjectiveId] = useState(objectives[0]?.id ?? "");
  const [unit, setUnit] = useState("%");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [polarity, setPolarity] = useState<"higher_is_better" | "lower_is_better">("higher_is_better");
  const [dataSourceType, setDataSourceType] = useState<"manual" | "feed">("manual");
  const [error, setError] = useState<string | null>(null);
  const busy = createDraft.isPending || align.isPending;

  const save = async () => {
    const userId = session.data?.user.id;
    if (!userId || !name.trim() || !objectiveId) return;
    setError(null);
    try {
      const created = await createDraft.mutateAsync({ nameEn: name.trim(), nameAr: name.trim(), descriptionEn: description.trim() || null, descriptionAr: null, unit: unit.trim() || "%", polarity, frequency, dataSourceType, calculationLogicText: null, ownerUserId: userId, stewardUserId: null, activeFrom: new Date() });
      await align.mutateAsync({ kpiDefinitionId: created.definition.id, alignments: [{ strategyNodeId: objectiveId, alignmentType: "objective" }] });
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create KPI"); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-semibold">Create KPI</h2><p className="text-xs text-gray-500">Creates a real Registry draft aligned to a strategic objective.</p></div><button type="button" onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button></div><div className="space-y-4 p-5">
    {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
    <Field label="KPI Name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Revenue Growth Rate" /></Field>
    <Field label="Strategic Objective"><select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} className={inputClass}>{objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.department} · {objective.name}</option>)}</select></Field>
    <div className="grid grid-cols-2 gap-3"><Field label="Unit"><input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} /></Field><Field label="Frequency"><select value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)} className={inputClass}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></Field></div>
    <div className="grid grid-cols-2 gap-3"><Field label="Polarity"><select value={polarity} onChange={(e) => setPolarity(e.target.value as typeof polarity)} className={inputClass}><option value="higher_is_better">Higher is better</option><option value="lower_is_better">Lower is better</option></select></Field><Field label="Data Source"><select value={dataSourceType} onChange={(e) => setDataSourceType(e.target.value as typeof dataSourceType)} className={inputClass}><option value="manual">Manual</option><option value="feed">Feed</option></select></Field></div>
    <Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-20 resize-none`} /></Field>
  </div><div className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button><button type="button" disabled={busy || !name.trim() || !objectiveId || !session.data?.user.id} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{busy ? "Saving…" : "Create Draft"}</button></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">{label}</span>{children}</label>; }
function Select({ value, onChange, placeholder, values, labels }: { value: string; onChange: (value: string) => void; placeholder: string; values: readonly string[]; labels?: readonly string[] }) { return <div className="relative"><select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-full border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-600"><option value="all">{placeholder}</option>{values.map((item, index) => <option key={item} value={item}>{labels?.[index] ?? item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /></div>; }
