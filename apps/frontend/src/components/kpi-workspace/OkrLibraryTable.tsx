"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Download, Plus, Search, Sparkles } from "lucide-react";
import { objectives as initialObjectives, okrDepartments, type OkrStatus } from "@/data/mockOkrLibrary";
import AiSuggestModal from "./AiSuggestModal";
import CreateOkrModal from "./CreateOkrModal";

const STATUS_META: Record<OkrStatus, { label: string; dot: string; bg: string; text: string }> = {
  "on-track": { label: "On Track", dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700" },
  "at-risk": { label: "At Risk", dot: "bg-orange-500", bg: "bg-orange-50", text: "text-orange-700" },
  behind: { label: "Behind", dot: "bg-red-500", bg: "bg-red-50", text: "text-red-700" },
};

const APPROVAL_META = {
  draft: { label: "Draft", bg: "bg-white", text: "text-gray-600", border: "border-gray-300" },
  pending: { label: "Pending", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  approved: { label: "Approved", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
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
  const offset = circumference * (1 - value / 100);
  const tone = progressTone(value);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-gray-100" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${tone.ring} stroke-current transition-[stroke-dashoffset]`}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${tone.ring}`}>{value}%</span>
    </div>
  );
}

function OwnerAvatar({ initials, color, className = "h-7 w-7 text-[10px]" }: { initials: string; color: string; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${color} ${className}`}>
      {initials}
    </span>
  );
}

export default function OkrLibraryTable() {
  const allObjectives = initialObjectives;
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [initialObjectives[0]?.id ?? ""]: true });
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    return allObjectives.filter((objective) => {
      if (department !== "all" && objective.department !== department) return false;
      if (status !== "all" && objective.status !== status) return false;
      if (search.trim() && !objective.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [allObjectives, search, department, status]);

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search objectives..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <Select value={department} onChange={setDepartment} placeholder="All Departments" options={okrDepartments} />
        <Select
          value={status}
          onChange={setStatus}
          placeholder="All Status"
          options={(Object.keys(STATUS_META) as OkrStatus[]).map((s) => STATUS_META[s].label)}
          rawValues={Object.keys(STATUS_META)}
        />

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Objective
        </button>

        <span className="ml-auto whitespace-nowrap text-sm text-gray-500">{filtered.length} OKRs</span>
      </div>

      <div className="divide-y divide-gray-100">
        {filtered.map((objective) => {
          const statusMeta = STATUS_META[objective.status];
          const approvalMeta = APPROVAL_META[objective.approval];
          const isOpen = !!expanded[objective.id];
          return (
            <div key={objective.id}>
              <button
                type="button"
                onClick={() => toggle(objective.id)}
                className="flex w-full flex-wrap items-center gap-4 p-4 text-left hover:bg-gray-50"
              >
                <ProgressRing value={objective.progress} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-gray-900">{objective.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                    <span>{objective.department}</span>
                    <span className="text-gray-300">·</span>
                    <span>{objective.quarter}</span>
                    <span className="text-gray-300">·</span>
                    <OwnerAvatar initials={objective.owner.initials} color={objective.owner.color} className="h-5 w-5 text-[9px]" />
                    <span>{objective.owner.name}</span>
                  </div>
                </div>

                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.bg} ${statusMeta.text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${approvalMeta.bg} ${approvalMeta.text} ${approvalMeta.border}`}>
                  {approvalMeta.label}
                </span>
                <span className="shrink-0 text-xs font-medium text-gray-400">{objective.keyResults.length} KRs</span>
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />}
              </button>

              {isOpen && (
                <div className="overflow-x-auto px-4 pb-4">
                  <div className="min-w-[720px] rounded-xl border border-gray-100">
                    <div className="grid grid-cols-[minmax(200px,2.5fr)_minmax(120px,1fr)_minmax(140px,1.3fr)_100px_minmax(90px,0.8fr)_minmax(90px,0.8fr)] gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      <span>Key Result</span>
                      <span>Actual / Target</span>
                      <span>Progress</span>
                      <span>Owner</span>
                      <span>Status</span>
                      <span>Due Date</span>
                    </div>
                    {objective.keyResults.map((kr) => {
                      const krTone = progressTone(kr.progress);
                      const krStatusMeta = STATUS_META[kr.status];
                      return (
                        <div
                          key={kr.id}
                          className="grid grid-cols-[minmax(200px,2.5fr)_minmax(120px,1fr)_minmax(140px,1.3fr)_100px_minmax(90px,0.8fr)_minmax(90px,0.8fr)] items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-sm last:border-b-0"
                        >
                          <span className="truncate text-gray-800">{kr.label}</span>
                          <span className="text-gray-600">
                            {kr.actual} / {kr.target}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div className={`h-full rounded-full ${krTone.bar}`} style={{ width: `${Math.min(100, kr.progress)}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${krTone.ring}`}>{kr.progress}%</span>
                          </div>
                          <OwnerAvatar initials={kr.owner.initials} color={kr.owner.color} />
                          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${krStatusMeta.bg} ${krStatusMeta.text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${krStatusMeta.dot}`} /> {krStatusMeta.label}
                          </span>
                          <span className="text-xs text-gray-500">{kr.dueDate}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && <p className="p-10 text-center text-sm text-gray-400">No objectives match these filters.</p>}
      </div>

      {showCreate && <CreateOkrModal onClose={() => setShowCreate(false)} />}
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

export function OkrLibraryStats() {
  const objectiveCount = initialObjectives.length;
  const avgProgress = Math.round(initialObjectives.reduce((sum, o) => sum + o.progress, 0) / objectiveCount);
  const keyResultCount = initialObjectives.reduce((sum, o) => sum + o.keyResults.length, 0);
  return (
    <>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">
        {objectiveCount} Objectives
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
        Avg {avgProgress}% Progress
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
        {keyResultCount} Key Results
      </span>
    </>
  );
}

export function OkrLibraryActions() {
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

      {showAiSuggest && <AiSuggestModal initialTypeFilter="okr" onClose={() => setShowAiSuggest(false)} />}
    </div>
  );
}
