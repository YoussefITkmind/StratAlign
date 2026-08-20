"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { COLOR_TOKENS, MOCK_INITIATIVES, type InitiativeColor } from "@/data/mockInitiativesBoard";
import { CreateInitiativeModal } from "@/components/initiatives/CreateInitiativeModal";

type FilterKey = "all" | "on_track" | "at_risk" | "off_track" | "mine";
type BackendStatus = "on_track" | "at_risk" | "off_track";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on_track", label: "On Track" },
  { key: "at_risk", label: "At Risk" },
  { key: "off_track", label: "Off Track" },
  { key: "mine", label: "My Plays" },
];

const STAGE_LABEL: Record<string, string> = {
  design: "Design",
  pilot: "Pilot",
  execute: "Execute",
  scale: "Scale",
  done: "Done",
};
const STATUS_LABEL: Record<string, string> = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };
const CONFIDENCE_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low" };

const BOARD_STATUS_TO_BACKEND: Record<string, BackendStatus | null> = {
  "On Track": "on_track",
  "At Risk": "at_risk",
  Behind: "off_track",
  "In Progress": null,
  Draft: null,
};
const BOARD_STAGE_TO_BACKEND: Record<string, string> = {
  Discovery: "design",
  Execution: "execute",
  Delivery: "scale",
  Planning: "design",
};
const BOARD_CONFIDENCE_TO_BACKEND: Record<string, "high" | "medium" | "low"> = { High: "high", Medium: "medium", Low: "low" };

interface RegisterRow {
  id: string;
  nameEn: string;
  playName: string;
  owner: string;
  stage: string;
  status: BackendStatus | null;
  confidence: "high" | "medium" | "low" | null;
  linked: number;
  updatedAt: string | Date;
  color: InitiativeColor;
  isMyPlay: boolean;
}

const MOCK_ROWS: RegisterRow[] = MOCK_INITIATIVES.map((item) => ({
  id: item.id,
  nameEn: item.name,
  playName: item.play,
  owner: item.owner,
  stage: BOARD_STAGE_TO_BACKEND[item.stage],
  status: BOARD_STATUS_TO_BACKEND[item.status],
  confidence: BOARD_CONFIDENCE_TO_BACKEND[item.confidence],
  linked: item.linkedProjects,
  updatedAt: item.lastUpdate,
  color: item.color,
  isMyPlay: item.isMyPlay,
}));

function badgeClass(tone: "neutral" | "emerald" | "amber" | "red") {
  switch (tone) {
    case "emerald":
      return "bg-emerald-50 text-emerald-700";
    case "amber":
      return "bg-orange-50 text-orange-700";
    case "red":
      return "bg-red-50 text-red-700";
    default:
      return "bg-slate-50 text-slate-500";
  }
}

function statusTone(status: string | null): "neutral" | "emerald" | "amber" | "red" {
  if (status === "on_track") return "emerald";
  if (status === "at_risk") return "amber";
  if (status === "off_track") return "red";
  return "neutral";
}

export function RegisterView() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const list = trpc.execution.initiative.list.useQuery({
    status: filter === "on_track" || filter === "at_risk" || filter === "off_track" ? filter : undefined,
    scope: filter === "mine" ? "mine" : "all",
  });
  const nodes = trpc.strategy.nodes.useQuery();
  const playNameById = new Map((nodes.data ?? []).map((node) => [node.id, node.nameEn]));

  const usingMockData = !list.isLoading && ((list.data?.length ?? 0) === 0 || list.isError);

  const realRows: RegisterRow[] = (list.data ?? []).map((item) => ({
    id: item.id,
    nameEn: item.nameEn,
    playName: playNameById.get(item.strategicPlayNodeId) ?? "—",
    owner: item.ownerUserId,
    stage: item.stage,
    status: item.latestStatus,
    confidence: item.latestConfidence,
    linked: item.hasJiraLink ? 1 : 0,
    updatedAt: item.updatedAt,
    color: colorForId(item.id),
    isMyPlay: false,
  }));

  const mockRows = MOCK_ROWS.filter((row) => {
    if (filter === "mine") return row.isMyPlay;
    if (filter === "all") return true;
    return row.status === filter;
  });

  const rows = (usingMockData ? mockRows : realRows).filter((row) =>
    search.trim() ? row.nameEn.toLowerCase().includes(search.trim().toLowerCase()) : true
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" data-testid="initiative-filter-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              data-testid={`filter-chip-${f.key}`}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                filter === f.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search register..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400 sm:w-56"
            />
          </div>
          <button
            data-testid="new-initiative-button"
            onClick={() => setCreating(true)}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New Initiative
          </button>
        </div>
      </div>

      {usingMockData && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-[12.5px] text-blue-700">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          Showing sample data — connect the Execution API to see live initiatives.
        </div>
      )}

      {creating && (
        <CreateInitiativeModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await utils.execution.initiative.list.invalidate();
          }}
        />
      )}

      {/* Desktop / tablet: full grid. */}
      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-start text-[13px]" data-testid="initiative-register-grid">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">Initiative</th>
                <th className="px-4 py-2.5 text-start font-medium">Play</th>
                <th className="px-4 py-2.5 text-start font-medium">Owner</th>
                <th className="px-4 py-2.5 text-start font-medium">Stage</th>
                <th className="px-4 py-2.5 text-start font-medium">Status</th>
                <th className="px-4 py-2.5 text-start font-medium">Confidence</th>
                <th className="px-4 py-2.5 text-start font-medium">Linked</th>
                <th className="px-4 py-2.5 text-start font-medium">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-testid="initiative-row" className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/initiatives-projects/${row.id}`} className="flex items-center gap-2 font-semibold text-slate-900 hover:underline">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_TOKENS[row.color].dot}`} />
                      {row.nameEn}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.playName}</td>
                  <td className="px-4 py-3 text-slate-400"><span className="break-all">{row.owner}</span></td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass("neutral")}`}>
                      {STAGE_LABEL[row.stage] ?? row.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass(statusTone(row.status))}`}>
                      {row.status ? STATUS_LABEL[row.status] : "No status yet"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.confidence ? CONFIDENCE_LABEL[row.confidence] : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{row.linked}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(row.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list.isLoading && !usingMockData && <p className="p-6 text-center text-[13px] text-slate-400">Loading…</p>}
        {rows.length === 0 && !list.isLoading && (
          <p className="p-8 text-center text-[13px] text-slate-400">No initiatives match this filter yet.</p>
        )}
      </div>

      {/* Mobile: stacked cards instead of a cramped table. */}
      <div className="mt-5 space-y-2.5 sm:hidden">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/initiatives-projects/${row.id}`}
            data-testid="initiative-row"
            className="block rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR_TOKENS[row.color].dot}`} />
              <span className="font-semibold text-slate-900">{row.nameEn}</span>
            </div>
            <p className="mt-0.5 text-[12px] text-slate-400">{row.playName}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass("neutral")}`}>
                {STAGE_LABEL[row.stage] ?? row.stage}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass(statusTone(row.status))}`}>
                {row.status ? STATUS_LABEL[row.status] : "No status yet"}
              </span>
              {row.confidence && (
                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {CONFIDENCE_LABEL[row.confidence]} confidence
                </span>
              )}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-slate-400">
              <span className="truncate">{row.owner}</span>
              <span>{new Date(row.updatedAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
        {rows.length === 0 && !list.isLoading && (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-[13px] text-slate-400">
            No initiatives match this filter yet.
          </p>
        )}
      </div>
    </div>
  );
}

const PALETTE: InitiativeColor[] = ["sky", "violet", "emerald", "purple", "red", "orange", "pink", "amber"];
function colorForId(id: string): InitiativeColor {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
