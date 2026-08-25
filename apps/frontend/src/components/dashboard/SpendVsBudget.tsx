import { AlertTriangle } from "lucide-react";
import { themeGroups } from "@/lib/dashboard/data";

function formatUsd(value: number) {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  return `$${Math.round(value / 1000)}K`;
}

export default function SpendVsBudget() {
  const initiatives = themeGroups.flatMap((g) => g.initiatives);
  const totalBudget = initiatives.reduce((sum, i) => sum + i.budgetTotal, 0);
  const committedSpend = initiatives.reduce((sum, i) => sum + i.budgetSpend, 0);
  const burn = Math.round((committedSpend / totalBudget) * 100);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Spend vs Budget</h3>
          <p className="text-xs text-slate-400">Initiative-reported estimates</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          ERP not connected
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-slate-400">TOTAL BUDGET</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{formatUsd(totalBudget)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-slate-400">COMMITTED SPEND</p>
          <p className="mt-1 text-lg font-semibold text-emerald-600">{formatUsd(committedSpend)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-slate-400">PORTFOLIO BURN</p>
          <p className="mt-1 text-lg font-semibold text-slate-800">{burn}%</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${burn}%` }} />
      </div>

      <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-xs font-semibold text-amber-800">ERP Actuals Not Available</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-700">
            Figures shown are initiative-reported spend estimates, not reconciled against your general ledger. Connect your ERP to enable invoice-level actuals vs. budget tracking.
          </p>
        </div>
      </div>

      <p className="mt-4 text-[10px] font-semibold tracking-wider text-slate-400">PER-INITIATIVE BREAKDOWN</p>
      <div className="mt-2 space-y-2.5">
        {initiatives
          .slice()
          .sort((a, b) => b.progress - a.progress)
          .map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="w-40 shrink-0 truncate text-slate-600">{item.name}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${item.progress}%`, background: item.color }} />
              </div>
              <span className="w-9 shrink-0 text-right font-medium text-slate-500">{item.progress}%</span>
              <span className="w-32 shrink-0 text-right text-slate-400">
                {formatUsd(item.budgetSpend)} / {formatUsd(item.budgetTotal)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
