import { AlertTriangle } from "lucide-react";
import { SimilarMatch } from "@/lib/similarity";
import { STATUS_CONFIG, formatValue } from "@/lib/kpiConfig";

export default function DuplicateCandidates({ matches }: { matches: SimilarMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> {matches.length} similar KPI{matches.length > 1 ? "s" : ""} already exist{matches.length === 1 ? "s" : ""} — check before creating a duplicate.
      </p>
      <div className="mt-2 space-y-1.5">
        {matches.map(({ kpi, score }) => {
          const cfg = STATUS_CONFIG[kpi.status];
          return (
            <div key={kpi.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
              <div>
                <p className="font-medium text-gray-900">{kpi.name}</p>
                <p className="text-gray-400">{kpi.domain} · {kpi.department} · {formatValue(kpi.actual, kpi.unit)} / {formatValue(kpi.target, kpi.unit)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 font-medium ${cfg.badgeBg} ${cfg.badgeText}`}>{cfg.label}</span>
                <span className="text-gray-400">{Math.round(score * 100)}% match</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
