"use client";

import { useMemo, useState } from "react";
import {
  Search, ChevronDown, Plus, Download, Sparkles, ArrowUpDown,
  TrendingUp, Users, Activity, Zap, Pencil, Check, Clock, AlertTriangle,
} from "lucide-react";
import { kpiLibraryRows, type KpiLibraryRow, type KpiPerspective, type KpiApproval, type KpiStatus } from "@/data/mockKpiLibrary";
import KpiDetailDrawer from "./KpiDetailDrawer";
import AiSuggestModal from "./AiSuggestModal";

const PERSPECTIVE_META: Record<KpiPerspective, { label: string; icon: typeof TrendingUp; text: string }> = {
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
  approved: { label: "Approved", icon: Check, bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

const PERSPECTIVE_FILTERS: { key: "all" | KpiPerspective; label: string; icon?: typeof TrendingUp }[] = [
  { key: "all", label: "All" },
  { key: "financial", label: "Financial", icon: TrendingUp },
  { key: "customer", label: "Customer", icon: Users },
  { key: "internal", label: "Internal", icon: Activity },
  { key: "learning", label: "Learning", icon: Zap },
];

const GRID_COLS = "grid-cols-[4px_minmax(140px,2.2fr)_minmax(80px,1fr)_minmax(80px,1fr)_28px_minmax(48px,0.7fr)_minmax(48px,0.7fr)_minmax(48px,0.7fr)_64px_minmax(56px,0.6fr)_minmax(76px,1fr)_minmax(76px,1fr)]";

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 60;
      const y = 20 - ((v - min) / range) * 18 - 1;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width="64" height="22" viewBox="0 0 64 22" className="shrink-0">
      <polyline points={points} fill="none" strokeWidth="1.75" className={color} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderCell({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 ${className}`}>
      {label} <ArrowUpDown className="h-3 w-3 text-gray-300" />
    </div>
  );
}

export default function KpiLibraryTable() {
  const [search, setSearch] = useState("");
  const [perspective, setPerspective] = useState<"all" | KpiPerspective>("all");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [approval, setApproval] = useState("all");
  const [selectedKpi, setSelectedKpi] = useState<KpiLibraryRow | null>(null);

  const departments = useMemo(() => Array.from(new Set(kpiLibraryRows.map((r) => r.department))).sort(), []);

  const rows = useMemo(() => {
    return kpiLibraryRows.filter((row) => {
      if (perspective !== "all" && row.perspective !== perspective) return false;
      if (department !== "all" && row.department !== department) return false;
      if (status !== "all" && row.status !== status) return false;
      if (approval !== "all" && row.approval !== approval) return false;
      if (search.trim() && !row.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [search, perspective, department, status, approval]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search KPIs..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {PERSPECTIVE_FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPerspective(key)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ${
                perspective === key ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />} {label}
            </button>
          ))}
        </div>

        <Select value={department} onChange={setDepartment} placeholder="All Departments" options={departments} />
        <Select
          value={status}
          onChange={setStatus}
          placeholder="All Status"
          options={(Object.keys(STATUS_META) as KpiStatus[]).map((s) => STATUS_META[s].label)}
          rawValues={Object.keys(STATUS_META)}
        />
        <Select
          value={approval}
          onChange={setApproval}
          placeholder="All Approvals"
          options={(Object.keys(APPROVAL_META) as KpiApproval[]).map((a) => APPROVAL_META[a].label)}
          rawValues={Object.keys(APPROVAL_META)}
        />

        <button className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add KPI <ChevronDown className="h-3.5 w-3.5" />
        </button>

        <span className="ml-auto whitespace-nowrap text-sm text-gray-500">
          {rows.length} KPIs · Page 1 of {Math.max(1, Math.ceil(rows.length / 10))}
        </span>
      </div>

      <div>
        <div className={`grid ${GRID_COLS} items-center gap-3 border-b border-gray-100 px-4 py-2.5`}>
            <div />
            <HeaderCell label="KPI Name" />
            <HeaderCell label="Perspective" />
            <HeaderCell label="Department" />
            <HeaderCell label="Owner" />
            <HeaderCell label="Actual" />
            <HeaderCell label="Target" />
            <HeaderCell label="Variance" />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Trend</div>
            <HeaderCell label="Freq" />
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Approval</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</div>
          </div>

          {rows.map((row) => {
            const perspectiveMeta = PERSPECTIVE_META[row.perspective];
            const statusMeta = STATUS_META[row.status];
            const approvalMeta = APPROVAL_META[row.approval];
            const PerspectiveIcon = perspectiveMeta.icon;
            const ApprovalIcon = approvalMeta.icon;
            return (
              <div
                key={row.id}
                onClick={() => setSelectedKpi(row)}
                className={`grid ${GRID_COLS} items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-b-0 hover:bg-gray-50 cursor-pointer`}
              >
                <span className={`h-8 w-1 justify-self-center rounded-full ${statusMeta.dot}`} />

                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{row.name}</div>
                  <div className={`text-xs font-medium ${perspectiveMeta.text}`}>{row.tag}</div>
                </div>

                <div className={`flex items-center gap-1.5 text-sm ${perspectiveMeta.text}`}>
                  <PerspectiveIcon className="h-3.5 w-3.5" /> {perspectiveMeta.label}
                </div>

                <div className="truncate text-sm text-gray-600">{row.department}</div>

                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ${row.owner.color}`}>
                  {row.owner.initials}
                </span>

                <div className="text-sm font-semibold text-gray-900">{row.actual}</div>
                <div className="text-sm text-gray-600">{row.target}</div>
                <div className={`text-sm font-medium ${row.favorable ? "text-emerald-600" : "text-red-500"}`}>{row.variance}</div>

                <div className="flex items-center gap-1.5">
                  <Sparkline values={row.trend} color={perspectiveMeta.text} />
                  {row.warning && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                </div>

                <div className="text-sm text-gray-600">{row.freq}</div>

                <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${approvalMeta.bg} ${approvalMeta.text} ${approvalMeta.border}`}>
                  <ApprovalIcon className="h-3 w-3" /> {approvalMeta.label}
                </span>

                <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.bg} ${statusMeta.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}
                </span>
              </div>
            );
          })}

          {rows.length === 0 && <p className="p-10 text-center text-sm text-gray-400">No KPIs match these filters.</p>}
      </div>

      {selectedKpi && <KpiDetailDrawer row={selectedKpi} onClose={() => setSelectedKpi(null)} />}
    </div>
  );
}

function Select({
  value, onChange, placeholder, options, rawValues,
}: {
  value: string; onChange: (value: string) => void; placeholder: string; options: string[]; rawValues?: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-gray-300 bg-white py-2 pl-3.5 pr-8 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none"
      >
        <option value="all">{placeholder}</option>
        {options.map((label, i) => (
          <option key={label} value={rawValues ? rawValues[i] : label}>{label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  );
}

export function KpiStatusBadge({ label, count, tone }: { label: string; count: number; tone: "on-track" | "at-risk" | "behind" }) {
  const meta = STATUS_META[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${meta.bg} ${meta.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} /> {count} {label}
    </span>
  );
}

export function KpiLibraryActions() {
  const [showAiSuggest, setShowAiSuggest] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <Download className="h-4 w-4" /> Export
      </button>
      <button
        onClick={() => setShowAiSuggest(true)}
        className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        <Sparkles className="h-4 w-4" /> AI Suggest
      </button>

      {showAiSuggest && <AiSuggestModal onClose={() => setShowAiSuggest(false)} />}
    </div>
  );
}
