import { themeGroups } from "@/lib/dashboard/data";

const WIDTH = 460;
const HEIGHT = 240;
const PAD = 24;

export default function PrioritizationQuadrant() {
  const initiatives = themeGroups.flatMap((g) => g.initiatives);

  const plotW = WIDTH - PAD * 2;
  const plotH = HEIGHT - PAD * 2;

  function toX(health: number) {
    return PAD + (health / 100) * plotW;
  }
  function toY(weight: number) {
    return PAD + (1 - weight / 100) * plotH;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-800">Prioritization Quadrant</h3>
      <p className="text-xs text-slate-400">Strategic weight vs execution health</p>

      <div className="mt-4">
        <p className="text-center text-[10px] font-semibold tracking-wider text-slate-400">
          ↑ HIGH STRATEGIC WEIGHT
        </p>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mt-1 w-full">
          <rect x={PAD} y={PAD} width={plotW / 2} height={plotH / 2} fill="#fef2f2" />
          <rect x={PAD + plotW / 2} y={PAD} width={plotW / 2} height={plotH / 2} fill="#f0fdf4" />
          <rect x={PAD} y={PAD + plotH / 2} width={plotW / 2} height={plotH / 2} fill="#f8fafc" />
          <rect
            x={PAD + plotW / 2}
            y={PAD + plotH / 2}
            width={plotW / 2}
            height={plotH / 2}
            fill="#ecfeff"
          />
          <line
            x1={PAD}
            y1={PAD + plotH / 2}
            x2={WIDTH - PAD}
            y2={PAD + plotH / 2}
            stroke="#e2e8f0"
          />
          <line
            x1={PAD + plotW / 2}
            y1={PAD}
            x2={PAD + plotW / 2}
            y2={HEIGHT - PAD}
            stroke="#e2e8f0"
          />
          <rect x={PAD} y={PAD} width={plotW} height={plotH} fill="none" stroke="#e2e8f0" />
          <text x={PAD + 6} y={PAD + 14} className="fill-slate-400 text-[9px] font-semibold">
            Needs Attention
          </text>
          <text x={WIDTH - PAD - 6} y={PAD + 14} textAnchor="end" className="fill-slate-400 text-[9px] font-semibold">
            Quick Wins
          </text>
          <text x={PAD + 6} y={HEIGHT - PAD - 6} className="fill-slate-400 text-[9px] font-semibold">
            Monitor
          </text>
          <text x={WIDTH - PAD - 6} y={HEIGHT - PAD - 6} textAnchor="end" className="fill-slate-400 text-[9px] font-semibold">
            Running Well
          </text>
          {initiatives.map((item) => (
            <g key={item.id} transform={`translate(${toX(item.healthScore)}, ${toY(item.strategicWeight)})`}>
              <circle r={12} fill={item.color} stroke="white" strokeWidth={2} />
              <text textAnchor="middle" dy="3.5" className="fill-white text-[9px] font-semibold">
                {item.owner.initials}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400">
        <span>— NEEDS ATTENTION</span>
        <span>EXECUTING —</span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {initiatives.map((item) => (
          <span key={item.id} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
