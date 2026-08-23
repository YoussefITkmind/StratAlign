"use client";

import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Kanban as KanbanIcon,
  GanttChart,
  List,
  Download,
  Lock,
  Plus,
  Layers,
  Link2,
  Search,
  ChevronDown,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { MOCK_INITIATIVES, type InitiativePriority, type MockInitiative } from "@/data/mockInitiativesBoard";
import { usePublishAssistantContext } from "@/lib/assistant/assistant-context";
import { CardsView } from "@/components/initiatives/CardsView";
import { KanbanView } from "@/components/initiatives/KanbanView";
import { GanttView } from "@/components/initiatives/GanttView";
import { RegisterView } from "@/components/initiatives/RegisterView";
import { CreateInitiativeModal } from "@/components/initiatives/CreateInitiativeModal";

const MAX_ASSISTANT_CONTEXT_INITIATIVES = 30;

type ViewKey = "cards" | "kanban" | "gantt" | "register";

const VIEWS: { key: ViewKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "cards", label: "Cards", icon: LayoutGrid },
  { key: "kanban", label: "Kanban", icon: KanbanIcon },
  { key: "gantt", label: "Gantt", icon: GanttChart },
  { key: "register", label: "Register", icon: List },
];

const PRIORITIES: ("All Priority" | InitiativePriority)[] = ["All Priority", "Critical", "High", "Medium", "Low"];
const DEPARTMENTS = ["All Departments", ...Array.from(new Set(MOCK_INITIATIVES.map((i) => i.department)))];

export function InitiativesBoardPage() {
  const [view, setView] = useState<ViewKey>("cards");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("All Priority");
  const [status, setStatus] = useState("All Status");
  const [department, setDepartment] = useState("All Departments");
  const [search, setSearch] = useState("");
  const [budgetLocked, setBudgetLocked] = useState(true);
  const [creating, setCreating] = useState(false);
  const utils = trpc.useUtils();

  // Real execution data, fetched independently of the (still mock-backed)
  // board below — this is what grounds the assistant.
  const initiativeListQuery = trpc.execution.initiative.list.useQuery({ scope: "all" });
  const assistantData = useMemo(() => {
    const rows = initiativeListQuery.data ?? [];
    if (!initiativeListQuery.data) return null;
    return {
      totalInitiatives: rows.length,
      onTrack: rows.filter((row) => row.latestStatus === "on_track").length,
      atRisk: rows.filter((row) => row.latestStatus === "at_risk").length,
      offTrack: rows.filter((row) => row.latestStatus === "off_track").length,
      initiatives: rows.slice(0, MAX_ASSISTANT_CONTEXT_INITIATIVES).map((row) => ({
        name: row.nameEn,
        stage: row.stage,
        status: row.latestStatus,
        confidence: row.latestConfidence,
      })),
    };
  }, [initiativeListQuery.data]);
  usePublishAssistantContext("initiatives_projects", null, assistantData);

  const filtered: MockInitiative[] = useMemo(() => {
    return MOCK_INITIATIVES.filter((item) => {
      if (priority !== "All Priority" && item.priority !== priority) return false;
      if (status !== "All Status" && item.status !== status) return false;
      if (department !== "All Departments" && item.department !== department) return false;
      if (search.trim() && !item.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [priority, status, department, search]);

  const behindCount = MOCK_INITIATIVES.filter((i) => i.status === "Behind").length;
  const highRiskCount = MOCK_INITIATIVES.reduce((sum, i) => sum + (i.risks >= 2 ? 1 : 0), 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">Initiatives &amp; Projects</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
            <span>{MOCK_INITIATIVES.length} initiatives · FY 2025</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[12px] font-medium text-blue-700">$3.9M total budget</span>
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-medium text-red-700">{behindCount} behind</span>
            <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[12px] font-medium text-orange-700">{highRiskCount} high risks</span>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="flex flex-1 items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-0.5 sm:flex-none">
            {VIEWS.map((v) => {
              const Icon = v.icon;
              const active = view === v.key;
              return (
                <button
                  key={v.key}
                  data-testid={`view-tab-${v.key}`}
                  onClick={() => setView(v.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3 ${
                    active ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{v.label}</span>
                </button>
              );
            })}
          </div>
          <button className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => setBudgetLocked((v) => !v)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
              budgetLocked ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Budget {budgetLocked ? "Locked" : "Unlocked"}</span>
          </button>
        </div>
      </div>

      {view !== "register" && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search initiatives..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 sm:w-60"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-slate-100 p-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition ${
                    priority === p ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[13px] text-slate-600 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                {["All Status", "Draft", "In Progress", "On Track", "At Risk", "Behind"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-[13px] text-slate-600 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            </div>
            <span className="ml-auto shrink-0 text-[12.5px] text-slate-400">
              {filtered.length} of {MOCK_INITIATIVES.length} initiatives
            </span>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-[12.5px] font-semibold uppercase tracking-wide text-slate-400">New:</span>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Create Initiative
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-700">
              <Layers className="h-4 w-4" />
              Create Project
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">
              <Link2 className="h-4 w-4" />
              Link Initiative
            </button>
          </div>
        </>
      )}

      <div className="mt-5">
        {view === "cards" && <CardsView initiatives={filtered} />}
        {view === "kanban" && <KanbanView initiatives={filtered} />}
        {view === "gantt" && <GanttView initiatives={filtered} />}
        {view === "register" && <RegisterView />}
      </div>

      {creating && (
        <CreateInitiativeModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await utils.execution.initiative.list.invalidate();
            setView("register");
          }}
        />
      )}
    </div>
  );
}
