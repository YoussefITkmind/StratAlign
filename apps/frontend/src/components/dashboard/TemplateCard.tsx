"use client";

import { LayoutGrid, TrendingUp, Zap } from "lucide-react";
import { DashboardTemplate } from "@/lib/dashboard/types";

const ICONS = {
  grid: LayoutGrid,
  trending: TrendingUp,
  bolt: Zap,
};

export default function TemplateCard({
  template,
  onUse,
}: {
  template: DashboardTemplate;
  onUse: (template: DashboardTemplate) => void;
}) {
  const Icon = ICONS[template.icon];

  return (
    <button
      onClick={() => onUse(template)}
      className="group flex flex-col items-start rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${template.iconBg} text-white`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-3 text-sm font-semibold text-slate-800">{template.name}</span>
      <span className="mt-1 text-sm text-slate-500">{template.description}</span>
      <span className="mt-3 text-sm font-medium text-[#2f6fed] opacity-90 group-hover:underline">
        {template.widgetCount} widgets
      </span>
    </button>
  );
}
