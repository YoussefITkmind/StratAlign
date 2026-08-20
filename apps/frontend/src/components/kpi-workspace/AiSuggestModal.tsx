"use client";

import { useMemo, useState } from "react";
import { Sparkles, X, Globe, ArrowRight, ChevronDown, Plus } from "lucide-react";
import { kpiSuggestions, THEME_COLORS, type SuggestionType } from "@/data/mockKpiSuggestions";

type TypeFilter = "all" | SuggestionType;
type Mode = "global" | "one-by-one";

export default function AiSuggestModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("global");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("kpi");
  const [theme, setTheme] = useState("all");
  const [resolved, setResolved] = useState<Record<string, "added" | "skipped">>({});
  const [cursor, setCursor] = useState(0);

  const themes = useMemo(() => Array.from(new Set(kpiSuggestions.map((s) => s.theme))), []);

  const filtered = useMemo(
    () =>
      kpiSuggestions.filter((s) => {
        if (resolved[s.id]) return false;
        if (typeFilter !== "all" && s.type !== typeFilter) return false;
        if (theme !== "all" && s.theme !== theme) return false;
        return true;
      }),
    [typeFilter, theme, resolved],
  );

  const resolve = (id: string, outcome: "added" | "skipped") => {
    setResolved((prev) => ({ ...prev, [id]: outcome }));
    setCursor((c) => Math.min(c, Math.max(0, filtered.length - 2)));
  };

  const visible = mode === "one-by-one" ? filtered.slice(cursor, cursor + 1) : filtered;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-indigo-50/60 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Sparkles className="h-5 w-5 text-indigo-600" /> AI-Suggested OKRs &amp; KPIs
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Generated from your strategy themes, current performance gaps, and industry benchmarks
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center overflow-hidden rounded-full border border-gray-200">
            <button
              onClick={() => setMode("global")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium ${mode === "global" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Globe className="h-3.5 w-3.5" /> Global (All Themes)
            </button>
            <button
              onClick={() => setMode("one-by-one")}
              className={`flex items-center gap-1.5 border-l border-gray-200 px-3.5 py-1.5 text-sm font-medium ${mode === "one-by-one" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <ArrowRight className="h-3.5 w-3.5" /> One By One
            </button>
          </div>

          <div className="flex items-center overflow-hidden rounded-full border border-gray-200">
            {(["all", "okr", "kpi"] as TypeFilter[]).map((key) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`border-l border-gray-200 px-3.5 py-1.5 text-sm font-medium first:border-l-0 ${typeFilter === key ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="appearance-none rounded-full border border-gray-200 bg-white py-1.5 pl-3.5 pr-8 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none"
            >
              <option value="all">All Themes</option>
              {themes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="app-scroll flex-1 space-y-3 overflow-y-auto p-5">
          {visible.map((s) => {
            const colors = THEME_COLORS[s.theme] ?? { badge: "bg-slate-600", accent: "bg-slate-800 hover:bg-slate-900" };
            return (
              <div key={s.id} className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${colors.badge}`}>{s.theme}</span>
                    <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-500">{s.type.toUpperCase()}</span>
                    <span className="text-xs text-gray-400">
                      AI confidence: <span className={s.confidence >= 80 ? "font-semibold text-emerald-600" : "font-semibold text-orange-500"}>{s.confidence}%</span>
                    </span>
                  </div>
                  <p className="text-[15px] font-semibold text-gray-900">{s.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-500">{s.description}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    Unit: {s.unit} &nbsp;·&nbsp; Freq: {s.freq} &nbsp;·&nbsp; Perspective: {s.perspective}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <button
                    onClick={() => resolve(s.id, "added")}
                    className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white ${colors.accent}`}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                  <button
                    onClick={() => resolve(s.id, "skipped")}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Skip
                  </button>
                </div>
              </div>
            );
          })}

          {visible.length === 0 && (
            <p className="p-10 text-center text-sm text-gray-400">
              {filtered.length === 0 && Object.keys(resolved).length > 0 ? "No more suggestions — you've reviewed them all." : "No suggestions match these filters."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
