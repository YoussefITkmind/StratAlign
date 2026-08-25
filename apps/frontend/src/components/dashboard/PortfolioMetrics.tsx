import { TrendingUp } from "lucide-react";

export default function PortfolioMetrics({
  total,
  onTrack,
  atRisk,
  offTrack,
  draft,
  health,
}: {
  total: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  draft: number;
  health: number;
}) {
  const segments = [
    { count: onTrack, color: "#1fa971" },
    { count: atRisk, color: "#f59e0b" },
    { count: offTrack, color: "#ef4444" },
    { count: draft, color: "#cbd5e1" },
  ];

  return (
    <div className="mx-6 mt-4 grid grid-cols-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white lg:grid-cols-[auto_auto_auto_auto_auto_1fr_auto] lg:divide-x lg:divide-y-0">
      <Metric label="PORTFOLIO HEALTH" value={`${health}%`} sub={`${total} initiatives`} valueClass="text-emerald-600" />
      <Metric label="ON TRACK" value={String(onTrack)} dot="#1fa971" />
      <Metric label="AT RISK" value={String(atRisk)} dot="#f59e0b" />
      <Metric label="OFF TRACK" value={String(offTrack)} dot="#ef4444" />
      <Metric label="DRAFT" value={String(draft)} dot="#94a3b8" />

      <div className="flex flex-col justify-center gap-2 px-5 py-4">
        <p className="text-[11px] font-semibold tracking-wider text-slate-400">RAG DISTRIBUTION</p>
        <div className="flex h-2 w-full min-w-[180px] overflow-hidden rounded-full bg-slate-100">
          {segments.map((s, i) =>
            s.count > 0 ? (
              <div
                key={i}
                style={{ width: `${(s.count / total) * 100}%`, background: s.color }}
              />
            ) : null
          )}
        </div>
        <p className="text-xs text-slate-400">
          {onTrack} On Track &nbsp; {atRisk} At Risk &nbsp; {offTrack} Off Track &nbsp; {draft} Draft
        </p>
      </div>

      <div className="flex flex-col justify-center gap-1 px-5 py-4">
        <p className="text-[11px] font-semibold tracking-wider text-slate-400">TREND</p>
        <p className="flex items-center gap-1 text-sm font-semibold text-emerald-600">
          <TrendingUp className="h-4 w-4" />
          Improving
        </p>
        <p className="text-xs text-slate-400">vs last month</p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  dot,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  dot?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-1 px-5 py-4">
      <p className="text-[11px] font-semibold tracking-wider text-slate-400">{label}</p>
      <p className={`flex items-center gap-1.5 text-2xl font-semibold text-slate-800 ${valueClass ?? ""}`}>
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        {value}
      </p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}
