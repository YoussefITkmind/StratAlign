"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Initiative, ThemeGroup } from "@/lib/dashboard/types";
import StatusPill from "./StatusPill";

const RAG_BORDER: Record<Initiative["rag"], string> = {
  "on-track": "border-l-emerald-500",
  "at-risk": "border-l-amber-500",
  "off-track": "border-l-red-500",
  draft: "border-l-slate-300",
};

const PROGRESS_COLOR: Record<Initiative["rag"], string> = {
  "on-track": "bg-emerald-500",
  "at-risk": "bg-amber-500",
  "off-track": "bg-red-500",
  draft: "bg-slate-300",
};

const CONFIDENCE_STYLES: Record<Initiative["confidence"], string> = {
  High: "text-emerald-600",
  Medium: "text-amber-600",
  Low: "text-red-600",
};

export default function ThemeGroupTable({ group }: { group: ThemeGroup }) {
  const [collapsed, setCollapsed] = useState(false);

  const flags: string[] = [];
  if (group.atRisk > 0) flags.push(`${group.atRisk} at risk`);
  if (group.behind > 0) flags.push(`${group.behind} behind`);

  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-5 py-3.5"
      >
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: group.color }} />
          <span className="text-sm font-semibold text-slate-800">{group.name}</span>
          <span className="text-xs text-slate-400">({group.initiatives.length})</span>
        </span>
        <span className="flex items-center gap-3">
          {flags.length > 0 && (
            <span className="text-xs font-medium text-slate-400">{flags.join(" · ")}</span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-t border-slate-100 text-left text-[11px] font-semibold tracking-wider text-slate-400">
                <th className="px-5 py-2.5 font-semibold">INITIATIVE · PLAY · OBJECTIVE</th>
                <th className="px-3 py-2.5 font-semibold">STATUS</th>
                <th className="px-3 py-2.5 font-semibold">STAGE</th>
                <th className="px-3 py-2.5 font-semibold">PROGRESS</th>
                <th className="px-3 py-2.5 font-semibold">MILESTONES</th>
                <th className="px-3 py-2.5 font-semibold">CONF.</th>
                <th className="px-5 py-2.5 font-semibold">OWNER</th>
              </tr>
            </thead>
            <tbody>
              {group.initiatives.map((item) => (
                <tr
                  key={item.id}
                  className={`border-t border-slate-50 border-l-4 ${RAG_BORDER[item.rag]} transition hover:bg-slate-50/60`}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-800">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {item.play} · {item.objective}
                    </p>
                  </td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-3 py-3.5 text-slate-600">{item.stage}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${PROGRESS_COLOR[item.rag]}`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-500">{item.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-slate-600">
                    {item.milestonesDone}/{item.milestonesTotal}
                    <span className="text-slate-400"> milestones</span>
                  </td>
                  <td className={`px-3 py-3.5 font-medium ${CONFIDENCE_STYLES[item.confidence]}`}>
                    {item.confidence}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: item.owner.color }}
                      title={item.owner.name}
                    >
                      {item.owner.initials}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
