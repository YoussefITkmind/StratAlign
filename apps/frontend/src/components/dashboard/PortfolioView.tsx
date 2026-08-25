"use client";

import { Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { themeGroups } from "@/lib/dashboard/data";
import FilterDropdown from "./FilterDropdown";
import PortfolioMetrics from "./PortfolioMetrics";
import ThemeGroupTable from "./ThemeGroupTable";
import PrioritizationQuadrant from "./PrioritizationQuadrant";
import SpendVsBudget from "./SpendVsBudget";

const RAG_LABELS: Record<string, string> = {
  "on-track": "On Track",
  "at-risk": "At Risk",
  "off-track": "Off Track",
  draft: "Draft",
};

export default function PortfolioView({ search }: { search: string }) {
  const [theme, setTheme] = useState("All");
  const [stage, setStage] = useState("All");
  const [risk, setRisk] = useState("All");

  const themeOptions = ["All", ...themeGroups.map((g) => g.name)];
  const stageOptions = ["All", "Planning", "Execution"];
  const riskOptions = ["All", "On Track", "At Risk", "Off Track", "Draft"];

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return themeGroups
      .filter((g) => theme === "All" || g.name === theme)
      .map((g) => ({
        ...g,
        initiatives: g.initiatives.filter((item) => {
          const matchesStage = stage === "All" || item.stage === stage;
          const matchesRisk = risk === "All" || RAG_LABELS[item.rag] === risk;
          const matchesSearch =
            !q ||
            item.name.toLowerCase().includes(q) ||
            item.play.toLowerCase().includes(q) ||
            item.objective.toLowerCase().includes(q);
          return matchesStage && matchesRisk && matchesSearch;
        }),
      }))
      .filter((g) => g.initiatives.length > 0);
  }, [theme, stage, risk, search]);

  const allInitiatives = filteredGroups.flatMap((g) => g.initiatives);
  const total = allInitiatives.length;
  const onTrack = allInitiatives.filter((i) => i.rag === "on-track").length;
  const atRisk = allInitiatives.filter((i) => i.rag === "at-risk").length;
  const offTrack = allInitiatives.filter((i) => i.rag === "off-track").length;
  const draft = allInitiatives.filter((i) => i.rag === "draft").length;
  const avgProgress = total
    ? Math.round(allInitiatives.reduce((sum, i) => sum + i.progress, 0) / total)
    : 0;

  const totalAll = themeGroups.flatMap((g) => g.initiatives).length;

  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <div className="flex flex-wrap items-center gap-2">
          <FilterDropdown
            icon={<Filter className="h-4 w-4 text-slate-400" />}
            label="All Themes"
            options={themeOptions}
            value={theme}
            onChange={setTheme}
          />
          <FilterDropdown label="All Stages" options={stageOptions} value={stage} onChange={setStage} />
          <FilterDropdown label="All Risk Levels" options={riskOptions} value={risk} onChange={setRisk} />
        </div>
        <p className="text-sm text-slate-400">
          {total} of {totalAll} initiatives
        </p>
      </div>

      <PortfolioMetrics
        total={total || 1}
        onTrack={onTrack}
        atRisk={atRisk}
        offTrack={offTrack}
        draft={draft}
        health={avgProgress}
      />

      <div className="px-6">
        {filteredGroups.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">No initiatives match these filters</p>
            <p className="mt-1 text-sm text-slate-400">Try adjusting the theme, stage, or risk filters.</p>
          </div>
        ) : (
          filteredGroups.map((group) => <ThemeGroupTable key={group.id} group={group} />)
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 px-6 lg:grid-cols-2">
        <PrioritizationQuadrant />
        <SpendVsBudget />
      </div>
    </div>
  );
}
