import { HistoryPoint, KpiStatus } from "@/types/kpi";
import { STATUS_CONFIG } from "@/lib/kpiConfig";

const WIDTH = 88;
const HEIGHT = 28;
const PAD = 3;

export default function TrendSparkline({ history, status, className }: { history: HistoryPoint[]; status: KpiStatus; className?: string }) {
  const values = history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((v - min) / range) * (HEIGHT - PAD * 2);
    return `${x},${y}`;
  });

  const color = STATUS_CONFIG[status].hex;
  const [lastX, lastY] = points[points.length - 1].split(",");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={`block h-7 w-full ${className ?? ""}`}
      aria-hidden="true"
    >
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
