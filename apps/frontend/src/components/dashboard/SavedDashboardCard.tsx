"use client";

import { LayoutGrid, MoreHorizontal, Star } from "lucide-react";
import { useState } from "react";
import { SavedDashboard } from "@/lib/dashboard/types";

export default function SavedDashboardCard({
  dashboard,
  onOpen,
}: {
  dashboard: SavedDashboard;
  onOpen: (dashboard: SavedDashboard) => void;
}) {
  const [starred, setStarred] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      {dashboard.shared && (
        <span className="absolute right-3 top-3 z-10 rounded-full border border-slate-200 bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-500 backdrop-blur">
          ⇄ Shared
        </span>
      )}

      <button onClick={() => onOpen(dashboard)} className="block w-full p-4 text-left">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-6 rounded-md"
              style={{
                background: `${dashboard.accent}1f`,
                opacity: i < 2 ? 1 : 0.75 - i * 0.05,
              }}
            />
          ))}
        </div>
      </button>

      <div className="border-t border-slate-100 px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">{dashboard.name}</p>
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: dashboard.accent }} />
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{dashboard.description}</p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {dashboard.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            <span className="font-medium text-slate-500">{dashboard.widgetCount} widgets</span>
            <span className="mx-1.5">·</span>
            {dashboard.date}
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setStarred((s) => !s)}
              aria-label="Star dashboard"
              className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-50 hover:text-amber-400"
            >
              <Star className={`h-4 w-4 ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="More options"
                className="rounded-md p-1.5 text-slate-300 transition hover:bg-slate-50 hover:text-slate-600"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="animate-fade-in absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {["Rename", "Duplicate", "Delete"].map((item) => (
                    <button
                      key={item}
                      onClick={() => setMenuOpen(false)}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-slate-50 ${
                        item === "Delete" ? "text-red-500" : "text-slate-600"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onOpen(dashboard)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Widgets
        </button>
      </div>
    </div>
  );
}
