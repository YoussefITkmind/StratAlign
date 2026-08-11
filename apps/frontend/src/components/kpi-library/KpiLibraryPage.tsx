"use client";

import { useMemo, useState } from "react";
import { Search, Download, Sparkles, Plus, ArrowUpDown, Upload, Pencil, Archive } from "lucide-react";
import { KpiStatus, PerspectiveKey } from "@/types/kpi";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG, STATUS_CONFIG, APPROVAL_CONFIG, formatValue, formatVariance } from "@/lib/kpiConfig";
import { isFavorableVariance } from "@/lib/metrics";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";
import TrendSparkline from "@/components/shared/TrendSparkline";
import KpiCreationWizard from "@/components/kpi-wizard/KpiCreationWizard";
import ImportKpiModal from "./ImportKpiModal";

type SortKey = "name" | "perspective" | "department" | "actual" | "target" | "variance" | "frequency" | "status";
const PAGE_SIZE = 8;

interface Props {
  onSelectKpi: (kpiId: string) => void; // view performance detail
  onEditKpi: (kpiId: string) => void; // open the Definition page
}

export default function KpiLibraryPage({ onSelectKpi, onEditKpi }: Props) {
  const { kpis } = useKpiStore();

  const [search, setSearch] = useState("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveKey | "all">("all");
  const [statusFilter, setStatusFilter] = useState<KpiStatus | "all">("all");
  const [approvalFilter, setApprovalFilter] = useState<"all" | "draft" | "pending" | "approved">("all");
  const [showRetired, setShowRetired] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [page, setPage] = useState(1);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiNote, setAiNote] = useState(false);

  const departments = useMemo(() => Array.from(new Set(kpis.map((k) => k.department))).sort(), [kpis]);

  const counts = useMemo(() => {
    const c: Record<KpiStatus, number> = { "on-track": 0, "at-risk": 0, behind: 0 };
    kpis.filter((k) => !k.retired).forEach((k) => c[k.status]++);
    return c;
  }, [kpis]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return kpis.filter((k) => {
      if (!showRetired && k.retired) return false;
      if (perspectiveFilter !== "all" && k.perspective !== perspectiveFilter) return false;
      if (statusFilter !== "all" && k.status !== statusFilter) return false;
      if (approvalFilter !== "all" && k.approval !== approvalFilter) return false;
      if (departmentFilter !== "all" && k.department !== departmentFilter) return false;
      if (term && !k.name.toLowerCase().includes(term) && !k.tag.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [kpis, search, perspectiveFilter, statusFilter, approvalFilter, departmentFilter, showRetired]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sort.dir;
      switch (sort.key) {
        case "name": return a.name.localeCompare(b.name) * dir;
        case "perspective": return a.perspective.localeCompare(b.perspective) * dir;
        case "department": return a.department.localeCompare(b.department) * dir;
        case "actual": return (a.actual - b.actual) * dir;
        case "target": return (a.target - b.target) * dir;
        case "variance": return ((a.actual - a.target) - (b.actual - b.target)) * dir;
        case "frequency": return a.frequency.localeCompare(b.frequency) * dir;
        case "status": return a.status.localeCompare(b.status) * dir;
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    setPage(1);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">{counts["on-track"]} On Track</span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{counts["at-risk"]} At Risk</span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{counts.behind} Behind</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
          <div className="relative">
            <button
              onClick={() => setAiNote((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
            >
              <Sparkles className="h-4 w-4" /> AI Suggest
            </button>
            {aiNote && (
              <div className="absolute right-0 top-11 z-10 w-64 rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-500 shadow-lg">
                AI-assisted KPI suggestions will appear here once connected to your strategy data.
              </div>
            )}
          </div>
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Upload className="h-4 w-4" /> Import
          </button>
          <button onClick={() => setWizardOpen(true)} className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Create KPI
          </button>
        </div>
      </div>

      <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search KPIs..."
                  className="w-56 rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
              </div>
              <button onClick={() => { setPerspectiveFilter("all"); setPage(1); }}
                className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide ${perspectiveFilter === "all" ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600"}`}>
                All
              </button>
              {PERSPECTIVE_ORDER.map((key) => {
                const cfg = PERSPECTIVE_CONFIG[key];
                const on = perspectiveFilter === key;
                const Icon = cfg.icon;
                return (
                  <button key={key} onClick={() => { setPerspectiveFilter(on ? "all" : key); setPage(1); }}
                    className="flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold"
                    style={{ background: on ? "#0f172a" : "white", color: on ? "white" : "#475569", border: `1px solid ${on ? "#0f172a" : "#e5e7eb"}` }}>
                    <Icon className="h-3 w-3" /> {cfg.label}
                  </button>
                );
              })}
              <select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
                <option value="all">All Departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as KpiStatus | "all"); setPage(1); }}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
                <option value="all">All Status</option>
                <option value="on-track">On Track</option>
                <option value="at-risk">At Risk</option>
                <option value="behind">Behind</option>
              </select>
              <select value={approvalFilter} onChange={(e) => { setApprovalFilter(e.target.value as typeof approvalFilter); setPage(1); }}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500">
                <option value="all">All Approvals</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <input type="checkbox" checked={showRetired} onChange={(e) => { setShowRetired(e.target.checked); setPage(1); }} className="h-3.5 w-3.5 rounded border-gray-300" />
                Show retired
              </label>
            </div>
            <p className="shrink-0 text-sm text-gray-400">{sorted.length} KPIs · Page {page} of {totalPages}</p>
          </div>

          <div className="space-y-3 md:hidden">
            {pageItems.map((kpi) => {
              const statusCfg = STATUS_CONFIG[kpi.status];
              const perspectiveCfg = PERSPECTIVE_CONFIG[kpi.perspective];
              const approvalCfg = APPROVAL_CONFIG[kpi.approval];
              const favorable = isFavorableVariance(kpi.actual, kpi.target, kpi.direction);
              const PIcon = perspectiveCfg.icon;
              return (
                <div
                  key={kpi.id}
                  onClick={() => onSelectKpi(kpi.id)}
                  className={`cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white p-4 active:bg-gray-50 ${kpi.retired ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                          {kpi.name}
                          {kpi.retired && <Archive className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
                        </p>
                        <p className="text-xs text-gray-400">{kpi.domain}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditKpi(kpi.id); }}
                      title="Edit definition"
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5">
                      <PIcon className={`h-3.5 w-3.5 shrink-0 ${perspectiveCfg.text}`} /> {perspectiveCfg.label}
                    </span>
                    <span className="text-gray-300">·</span>
                    <span>{kpi.department}</span>
                    <span className="text-gray-300">·</span>
                    <span>{kpi.frequency.charAt(0).toUpperCase() + kpi.frequency.slice(1)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Actual</p>
                      <p className="text-sm font-semibold text-gray-900">{formatValue(kpi.actual, kpi.unit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Target</p>
                      <p className="text-sm text-gray-500">{formatValue(kpi.target, kpi.unit)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Variance</p>
                      <p className={`text-sm font-medium ${favorable ? "text-emerald-600" : "text-red-500"}`}>
                        {formatVariance(kpi.actual, kpi.target, kpi.unit)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${kpi.owner.color}`}>
                        {kpi.owner.initials}
                      </span>
                      <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-1 text-xs font-medium ${approvalCfg.border} ${approvalCfg.bg} ${approvalCfg.text}`}>
                        {approvalCfg.label}
                      </span>
                      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    {kpi.history.length > 1 && (
                      <div className="w-16 shrink-0">
                        <TrendSparkline history={kpi.history} status={kpi.status} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {pageItems.length === 0 && (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-16 text-center text-sm text-gray-400">
                No KPIs match your filters.
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[6%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
                  <Th label="KPI Name" onClick={() => toggleSort("name")} />
                  <Th label="Perspective" onClick={() => toggleSort("perspective")} />
                  <Th label="Department" onClick={() => toggleSort("department")} />
                  <th className="overflow-hidden px-2 py-3 truncate">Owner</th>
                  <Th label="Actual" onClick={() => toggleSort("actual")} align="right" />
                  <Th label="Target" onClick={() => toggleSort("target")} align="right" />
                  <Th label="Variance" onClick={() => toggleSort("variance")} align="right" />
                  <th className="overflow-hidden px-3 py-3 truncate">Trend</th>
                  <Th label="Freq" onClick={() => toggleSort("frequency")} />
                  <th className="overflow-hidden px-3 py-3 truncate">Approval</th>
                  <Th label="Status" onClick={() => toggleSort("status")} />
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((kpi) => {
                  const statusCfg = STATUS_CONFIG[kpi.status];
                  const perspectiveCfg = PERSPECTIVE_CONFIG[kpi.perspective];
                  const approvalCfg = APPROVAL_CONFIG[kpi.approval];
                  const favorable = isFavorableVariance(kpi.actual, kpi.target, kpi.direction);
                  const PIcon = perspectiveCfg.icon;
                  return (
                    <tr key={kpi.id} onClick={() => onSelectKpi(kpi.id)} className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${kpi.retired ? "opacity-50" : ""}`}>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${statusCfg.dot}`} />
                          <div>
                            <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                              {kpi.name}
                              {kpi.retired && <Archive className="h-3.5 w-3.5 text-gray-400" />}
                            </p>
                            <p className="text-xs text-gray-400">{kpi.domain}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1.5 text-gray-600">
                          <PIcon className={`h-3.5 w-3.5 shrink-0 ${perspectiveCfg.text}`} /> {perspectiveCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{kpi.department}</td>
                      <td className="px-2 py-3">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold text-white ${kpi.owner.color}`}>
                          {kpi.owner.initials}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900">{formatValue(kpi.actual, kpi.unit)}</td>
                      <td className="px-3 py-3 text-right text-gray-500">{formatValue(kpi.target, kpi.unit)}</td>
                      <td className={`px-3 py-3 text-right font-medium ${favorable ? "text-emerald-600" : "text-red-500"}`}>
                        {formatVariance(kpi.actual, kpi.target, kpi.unit)}
                      </td>
                      <td className="px-3 py-3">
                        {kpi.history.length > 1 ? <TrendSparkline history={kpi.history} status={kpi.status} /> : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600">
                        {kpi.frequency.charAt(0).toUpperCase() + kpi.frequency.slice(1)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block rounded-full border px-2 py-1 text-xs font-medium ${approvalCfg.border} ${approvalCfg.bg} ${approvalCfg.text}`}>
                          {approvalCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${statusCfg.badgeBg} ${statusCfg.badgeText}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEditKpi(kpi.id); }}
                          title="Edit definition"
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {pageItems.length === 0 && (
                  <tr><td colSpan={12} className="px-3 py-16 text-center text-sm text-gray-400">No KPIs match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-3 flex justify-end gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} onClick={() => setPage(i + 1)}
                  className={`h-8 w-8 rounded-full text-sm font-medium ${page === i + 1 ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
      </div>

      {wizardOpen && (
        <KpiCreationWizard onClose={() => setWizardOpen(false)} onCreated={(kpiId) => { setWizardOpen(false); onEditKpi(kpiId); }} />
      )}
      {importOpen && <ImportKpiModal onClose={() => setImportOpen(false)} onImported={() => setImportOpen(false)} />}
    </div>
  );
}

function Th({ label, onClick, align = "left" }: { label: string; onClick: () => void; align?: "left" | "right" }) {
  return (
    <th className={`overflow-hidden px-3 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`flex w-full items-center gap-1 uppercase hover:text-gray-700 ${align === "right" ? "flex-row-reverse justify-end" : ""}`}
      >
        <span className="truncate">{label}</span>
        <ArrowUpDown className="h-3 w-3 shrink-0" />
      </button>
    </th>
  );
}
