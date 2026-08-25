"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Search, Trash2, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import type { KpiStatus, ObjectiveOption, OkrLibraryRow } from "@/types/kpi-workspace";

const STATUS_META: Record<KpiStatus, { label: string; dot: string; bg: string; text: string }> = {
  "on-track": { label: "On Track", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  "at-risk": { label: "At Risk", dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
  behind: { label: "Behind", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
};

function progressTone(value: number) {
  if (value >= 75) return { ring: "text-emerald-500", bar: "bg-emerald-500" };
  if (value >= 50) return { ring: "text-orange-500", bar: "bg-orange-500" };
  return { ring: "text-red-500", bar: "bg-red-500" };
}

function ProgressRing({ value }: { value: number }) {
  const size = 56;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, value)) / 100);
  const tone = progressTone(value);
  return <div className="relative shrink-0" style={{ width: size, height: size }}><svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-gray-100" fill="none" /><circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" strokeDasharray={circumference} strokeDashoffset={offset} className={`${tone.ring} stroke-current`} /></svg><span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${tone.ring}`}>{value}%</span></div>;
}

export function OkrLibraryStats({ rows }: { rows: OkrLibraryRow[] }) {
  const avg = rows.length === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length);
  const keyResults = rows.reduce((sum, row) => sum + row.keyResults.length, 0);
  return <><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">{rows.length} Objectives</span><span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">Avg {avg}% Progress</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">{keyResults} Key Results</span></>;
}

export default function PersistedOkrLibraryTable({ rows, objectives, onRefresh }: { rows: OkrLibraryRow[]; objectives: ObjectiveOption[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState<"all" | KpiStatus>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  const departments = useMemo(() => Array.from(new Set(rows.map((row) => row.department))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (department !== "all" && row.department !== department) return false;
    if (status !== "all" && row.status !== status) return false;
    return !search.trim() || row.title.toLowerCase().includes(search.trim().toLowerCase());
  }), [rows, department, status, search]);

  return <div className="rounded-2xl border border-gray-200 bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4"><div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search objectives..." className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500" /></div><Select value={department} onChange={setDepartment} placeholder="All Departments" options={departments} /><Select value={status} onChange={(value) => setStatus(value as typeof status)} placeholder="All Status" options={["on-track", "at-risk", "behind"]} labels={["On Track", "At Risk", "Behind"]} /><button type="button" onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Plus className="h-4 w-4" /> New Objective</button><span className="ml-auto text-sm text-gray-500">{filtered.length} OKRs</span></div>
    <div className="divide-y divide-gray-100">{filtered.map((okr) => { const meta = STATUS_META[okr.status]; const open = !!expanded[okr.id]; return <div key={okr.id}><button type="button" onClick={() => setExpanded((current) => ({ ...current, [okr.id]: !current[okr.id] }))} className="flex w-full flex-wrap items-center gap-4 p-4 text-left hover:bg-gray-50"><ProgressRing value={okr.progress} /><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold text-gray-900">{okr.title}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500"><span>{okr.department}</span><span>·</span><span>{okr.quarter}</span><span>·</span><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white ${okr.owner.color}`}>{okr.owner.initials}</span><span>{okr.owner.name}</span></div></div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.bg} ${meta.text}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span><span className="text-xs font-medium text-gray-400">{okr.keyResults.length} KRs</span>{open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}</button>{open && <div className="overflow-x-auto px-4 pb-4"><div className="min-w-[720px] rounded-xl border border-gray-100"><div className="grid grid-cols-[minmax(220px,2.5fr)_130px_minmax(150px,1.3fr)_90px_150px] gap-3 border-b bg-gray-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><span>Key Result</span><span>Actual / Target</span><span>Progress</span><span>Status</span><span>Last Updated</span></div>{okr.keyResults.map((kr) => { const tone = progressTone(kr.progress); const statusMeta = STATUS_META[kr.status]; return <div key={kr.id} className="grid grid-cols-[minmax(220px,2.5fr)_130px_minmax(150px,1.3fr)_90px_150px] items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-0"><span className="truncate text-gray-800">{kr.label}</span><span className="text-gray-600">{kr.actual} / {kr.target}</span><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${kr.progress}%` }} /></div><span className={`text-xs font-medium ${tone.ring}`}>{kr.progress}%</span></div><span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs ${statusMeta.bg} ${statusMeta.text}`}>{statusMeta.label}</span><span className="truncate text-xs text-gray-500">{kr.updatedAt === "Not updated" ? kr.updatedAt : new Date(kr.updatedAt).toLocaleDateString()}</span></div>; })}</div></div>}</div>; })}{filtered.length === 0 && <p className="p-10 text-center text-sm text-gray-400">No persisted OKRs match these filters.</p>}</div>
    {showCreate && <CreatePersistedOkrModal objectives={objectives} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await onRefresh(); }} />}
  </div>;
}

type DraftKr = { title: string; target: string; current: string; unit: string };
const blankKr = (): DraftKr => ({ title: "", target: "", current: "", unit: "%" });

function CreatePersistedOkrModal({ objectives, onClose, onSaved }: { objectives: ObjectiveOption[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const create = trpc.registry.okr.create.useMutation();
  const updateProgress = trpc.registry.keyResult.updateProgress.useMutation();
  const [objectiveId, setObjectiveId] = useState(objectives[0]?.id ?? "");
  const [name, setName] = useState("");
  const [keyResults, setKeyResults] = useState<DraftKr[]>([blankKr(), blankKr(), blankKr()]);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || updateProgress.isPending;

  const save = async () => {
    const valid = keyResults.filter((kr) => kr.title.trim() && Number.isFinite(Number(kr.target)));
    if (!objectiveId || !name.trim() || valid.length === 0) return;
    setError(null);
    try {
      const created = await create.mutateAsync({ objectiveNodeId: objectiveId, nameEn: name.trim(), nameAr: name.trim(), keyResults: valid.map((kr) => ({ type: "quantitative" as const, targetValue: Number(kr.target), unit: kr.unit.trim() || "%", titleEn: kr.title.trim(), titleAr: kr.title.trim() })) });
      await Promise.all(created.keyResults.map((kr, index) => { const current = valid[index]?.current.trim(); return current && Number.isFinite(Number(current)) ? updateProgress.mutateAsync({ keyResultId: kr.id, currentValue: Number(current) }) : Promise.resolve(); }));
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create OKR"); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"><div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="text-lg font-semibold">Create OKR</h2><p className="text-xs text-gray-500">Attaches the OKR to an existing strategic objective.</p></div><button type="button" onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button></div><div className="space-y-4 overflow-y-auto p-5">{error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}<Field label="Strategic Objective"><select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} className={inputClass}>{objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.department} · {objective.name}</option>)}</select></Field><Field label="OKR Objective"><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Accelerate profitable enterprise growth" /></Field><div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium text-gray-700">Key Results</span><button type="button" onClick={() => setKeyResults((rows) => [...rows, blankKr()])} className="flex items-center gap-1 text-xs font-medium text-blue-600"><Plus className="h-3.5 w-3.5" /> Add KR</button></div><div className="space-y-3">{keyResults.map((kr, index) => <div key={index} className="rounded-xl border p-3"><div className="mb-2 flex gap-2"><input value={kr.title} onChange={(e) => setKeyResults((rows) => rows.map((row, i) => i === index ? { ...row, title: e.target.value } : row))} className={`${inputClass} flex-1`} placeholder="Key result title" />{keyResults.length > 1 && <button type="button" onClick={() => setKeyResults((rows) => rows.filter((_, i) => i !== index))} className="rounded-lg p-2 text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>}</div><div className="grid grid-cols-3 gap-2"><input value={kr.current} onChange={(e) => setKeyResults((rows) => rows.map((row, i) => i === index ? { ...row, current: e.target.value } : row))} className={inputClass} placeholder="Current" /><input value={kr.target} onChange={(e) => setKeyResults((rows) => rows.map((row, i) => i === index ? { ...row, target: e.target.value } : row))} className={inputClass} placeholder="Target" /><input value={kr.unit} onChange={(e) => setKeyResults((rows) => rows.map((row, i) => i === index ? { ...row, unit: e.target.value } : row))} className={inputClass} placeholder="Unit" /></div></div>)}</div></div></div><div className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button type="button" onClick={() => void save()} disabled={busy || !objectiveId || !name.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{busy ? "Saving…" : "Create OKR"}</button></div></div></div>;
}

const inputClass = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-1 block font-medium text-gray-700">{label}</span>{children}</label>; }
function Select({ value, onChange, placeholder, options, labels }: { value: string; onChange: (value: string) => void; placeholder: string; options: string[]; labels?: string[] }) { return <div className="relative"><select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none rounded-full border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-600"><option value="all">{placeholder}</option>{options.map((option, index) => <option key={option} value={option}>{labels?.[index] ?? option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /></div>; }
