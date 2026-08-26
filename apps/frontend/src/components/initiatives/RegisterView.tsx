"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  FolderKanban,
  Link2,
  Plus,
  Search,
  Target,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { CreateInitiativeModal } from "@/components/initiatives/CreateInitiativeModal";

type FilterKey = "all" | "on_track" | "at_risk" | "off_track" | "mine";
type RegisterTab = "initiatives" | "projects";

interface Props {
  defaultTab?: RegisterTab;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on_track", label: "On Track" },
  { key: "at_risk", label: "At Risk" },
  { key: "off_track", label: "Off Track" },
  { key: "mine", label: "Mine" },
];

const STAGE_LABEL: Record<string, string> = {
  design: "Design",
  pilot: "Pilot",
  execute: "Execute",
  scale: "Scale",
  done: "Done",
};

const STATUS_LABEL: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
};

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const PRIORITY_LABEL: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function statusClass(status: string | null) {
  if (status === "on_track") return "bg-emerald-50 text-emerald-700";
  if (status === "at_risk") return "bg-amber-50 text-amber-700";
  if (status === "off_track") return "bg-red-50 text-red-700";
  return "bg-slate-50 text-slate-500";
}

function priorityClass(priority: string) {
  if (priority === "critical") return "bg-red-50 text-red-700";
  if (priority === "high") return "bg-orange-50 text-orange-700";
  if (priority === "medium") return "bg-blue-50 text-blue-700";
  return "bg-slate-50 text-slate-600";
}

function formatDate(value: string | Date | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBudget(value: string | null) {
  if (!value) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RegisterView({ defaultTab = "initiatives" }: Props) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<RegisterTab>(defaultTab);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const initiatives = trpc.execution.initiative.list.useQuery({
    status: filter === "on_track" || filter === "at_risk" || filter === "off_track" ? filter : undefined,
    scope: filter === "mine" ? "mine" : "all",
  });
  const projects = trpc.execution.project.list.useQuery({});
  const nodes = trpc.strategy.nodes.useQuery();
  const people = trpc.governance.listApprovers.useQuery();

  const playNameById = useMemo(
    () => new Map((nodes.data ?? []).map((node) => [node.id, node.nameEn])),
    [nodes.data],
  );
  const initiativeNameById = useMemo(
    () => new Map((initiatives.data ?? []).map((item) => [item.id, item.nameEn])),
    [initiatives.data],
  );
  const personNameById = useMemo(
    () => new Map((people.data ?? []).map((person) => [person.id, person.name])),
    [people.data],
  );

  const query = search.trim().toLowerCase();
  const filteredInitiatives = (initiatives.data ?? []).filter((item) => {
    if (!query) return true;
    return (
      item.nameEn.toLowerCase().includes(query) ||
      (playNameById.get(item.strategicPlayNodeId) ?? "").toLowerCase().includes(query) ||
      (item.ownerDisplayName ?? "").toLowerCase().includes(query)
    );
  });
  const filteredProjects = (projects.data ?? []).filter((project) => {
    if (!query) return true;
    return (
      project.name.toLowerCase().includes(query) ||
      (project.department ?? "").toLowerCase().includes(query) ||
      (initiativeNameById.get(project.parentInitiativeId ?? "") ?? "").toLowerCase().includes(query) ||
      (personNameById.get(project.ownerUserId) ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("initiatives")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === "initiatives" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Target className="h-4 w-4" />
            Initiatives
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "initiatives" ? "bg-white/20" : "bg-slate-100"}`}>
              {initiatives.data?.length ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("projects")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${
              tab === "projects" ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FolderKanban className="h-4 w-4" />
            Projects
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${tab === "projects" ? "bg-white/20" : "bg-slate-100"}`}>
              {projects.data?.length ?? 0}
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${tab}...`}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400 sm:w-64"
            />
          </div>
          {tab === "initiatives" && (
            <button
              data-testid="new-initiative-button"
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> New Initiative
            </button>
          )}
        </div>
      </div>

      {tab === "initiatives" && (
        <>
          <div className="mt-4 flex flex-wrap gap-2" data-testid="initiative-filter-chips">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                data-testid={`filter-chip-${item.key}`}
                onClick={() => setFilter(item.key)}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                  filter === item.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-start text-[13px]" data-testid="initiative-register-grid">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">Initiative</th>
                    <th className="px-4 py-3 text-start font-medium">Strategic Play</th>
                    <th className="px-4 py-3 text-start font-medium">Owner</th>
                    <th className="px-4 py-3 text-start font-medium">Stage</th>
                    <th className="px-4 py-3 text-start font-medium">Status</th>
                    <th className="px-4 py-3 text-start font-medium">Confidence</th>
                    <th className="px-4 py-3 text-start font-medium">Projects</th>
                    <th className="px-4 py-3 text-start font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInitiatives.map((item) => (
                    <tr key={item.id} data-testid="initiative-row" className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/initiatives-projects/${item.id}`} className="font-semibold text-slate-900 hover:text-blue-700 hover:underline">
                          {item.nameEn}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{playNameById.get(item.strategicPlayNodeId) ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{item.ownerDisplayName ?? personNameById.get(item.ownerUserId) ?? "—"}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">{STAGE_LABEL[item.stage] ?? item.stage}</span></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClass(item.latestStatus)}`}>{item.latestStatus ? STATUS_LABEL[item.latestStatus] : "No status"}</span></td>
                      <td className="px-4 py-3 text-slate-600">{item.latestConfidence ? CONFIDENCE_LABEL[item.latestConfidence] : "—"}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{item.linkedProjectCount}</td>
                      <td className="px-4 py-3 text-slate-400">{formatDate(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {initiatives.isLoading && <p className="p-7 text-center text-[13px] text-slate-400">Loading persisted initiatives…</p>}
            {initiatives.isError && <p className="p-7 text-center text-[13px] text-red-500">Could not load persisted initiatives.</p>}
            {!initiatives.isLoading && !initiatives.isError && filteredInitiatives.length === 0 && <p className="p-8 text-center text-[13px] text-slate-400">No persisted initiatives match this view.</p>}
          </div>
        </>
      )}

      {tab === "projects" && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Persisted Projects</h3>
            <p className="mt-0.5 text-xs text-slate-500">Standalone and initiative-linked projects stored in Execution.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-start text-[13px]" data-testid="project-register-grid">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">Project</th>
                  <th className="px-4 py-3 text-start font-medium">Parent Initiative</th>
                  <th className="px-4 py-3 text-start font-medium">Owner</th>
                  <th className="px-4 py-3 text-start font-medium">Department</th>
                  <th className="px-4 py-3 text-start font-medium">Priority</th>
                  <th className="px-4 py-3 text-start font-medium">Budget</th>
                  <th className="px-4 py-3 text-start font-medium">Dates</th>
                  <th className="px-4 py-3 text-start font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} data-testid="project-row" className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{project.name}</div>
                      {project.description && <div className="mt-0.5 max-w-[280px] truncate text-[11px] text-slate-400">{project.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{project.parentInitiativeId ? initiativeNameById.get(project.parentInitiativeId) ?? "Linked initiative" : "Standalone"}</td>
                    <td className="px-4 py-3 text-slate-600">{personNameById.get(project.ownerUserId) ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{project.department ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${priorityClass(project.priority)}`}>{PRIORITY_LABEL[project.priority] ?? project.priority}</span></td>
                    <td className="px-4 py-3 font-medium text-slate-700">{formatBudget(project.budgetAmount)}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">{formatDate(project.startDate)}<span className="mx-1">→</span>{formatDate(project.endDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {project.jiraBoardUrl && <a href={project.jiraBoardUrl} target="_blank" rel="noreferrer" title="Open Jira" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-blue-600"><ExternalLink className="h-3.5 w-3.5" /></a>}
                        {project.confluenceSpaceUrl && <a href={project.confluenceSpaceUrl} target="_blank" rel="noreferrer" title="Open Confluence" className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-blue-600"><Link2 className="h-3.5 w-3.5" /></a>}
                        {!project.jiraBoardUrl && !project.confluenceSpaceUrl && <span className="text-slate-300">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {projects.isLoading && <p className="p-7 text-center text-[13px] text-slate-400">Loading persisted projects…</p>}
          {projects.isError && <p className="p-7 text-center text-[13px] text-red-500">Could not load persisted projects.</p>}
          {!projects.isLoading && !projects.isError && filteredProjects.length === 0 && <p className="p-8 text-center text-[13px] text-slate-400">No persisted projects yet. Create one from the main Execution view.</p>}
        </div>
      )}

      {creating && (
        <CreateInitiativeModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await Promise.all([
              utils.execution.initiative.list.invalidate(),
              utils.execution.project.list.invalidate(),
            ]);
          }}
        />
      )}
    </div>
  );
}
