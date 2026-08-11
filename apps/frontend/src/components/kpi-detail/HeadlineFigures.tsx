import { Kpi } from "@/types/kpi";
import { formatValue, formatVariance, STATUS_CONFIG } from "@/lib/kpiConfig";
import { isFavorableVariance, ytdAverage } from "@/lib/metrics";

export default function HeadlineFigures({ kpi }: { kpi: Kpi }) {
  const favorable = isFavorableVariance(kpi.actual, kpi.target, kpi.direction);
  const ytd = ytdAverage(kpi.history);
  const statusCfg = STATUS_CONFIG[kpi.status];

  const figures = [
    { label: "Actual", value: formatValue(kpi.actual, kpi.unit), accent: statusCfg.badgeText },
    { label: "Target", value: formatValue(kpi.target, kpi.unit), accent: "text-gray-900" },
    { label: "Variance", value: formatVariance(kpi.actual, kpi.target, kpi.unit), accent: favorable ? "text-emerald-600" : "text-red-500" },
    { label: "Baseline", value: formatValue(kpi.baseline, kpi.unit), accent: "text-gray-900" },
    { label: "YTD Average", value: ytd === null ? "—" : formatValue(ytd, kpi.unit), accent: "text-gray-900" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {figures.map((f) => (
        <div key={f.label} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{f.label}</p>
          <p className={`mt-1 text-xl font-bold ${f.accent}`}>{f.value}</p>
        </div>
      ))}
    </div>
  );
}
