import { HistoryPoint, RuleDefinition } from "@/types/kpi";
import { STATUS_CONFIG } from "@/lib/kpiConfig";
import { evaluateStatus } from "@/lib/ruleEngine";

const WIDTH = 720;
const HEIGHT = 220;
const PAD_X = 40;
const PAD_Y = 16;

export default function ThresholdChart({ history, rule }: { history: HistoryPoint[]; rule: RuleDefinition }) {
  if (history.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-400">No measurements recorded yet.</p>;
  }

  const values = history.map((h) => h.value);
  const boundaries = rule.bands.map((b) => b.value);
  const rawMin = Math.min(...values, ...boundaries);
  const rawMax = Math.max(...values, ...boundaries);
  const pad = (rawMax - rawMin) * 0.15 || Math.abs(rawMax) * 0.1 || 1;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  const y = (v: number) => HEIGHT - PAD_Y - ((v - yMin) / (yMax - yMin)) * (HEIGHT - PAD_Y * 2);
  const x = (i: number) => PAD_X + (history.length === 1 ? 0 : (i / (history.length - 1)) * (WIDTH - PAD_X * 2));

  const breakpoints = Array.from(new Set([yMin, ...boundaries, yMax])).sort((a, b) => a - b);
  const bands = breakpoints.slice(0, -1).map((start, i) => {
    const end = breakpoints[i + 1];
    const mid = (start + end) / 2;
    const status = evaluateStatus(mid, rule);
    return { y1: y(end), y2: y(start), color: STATUS_CONFIG[status].hex };
  });

  const linePoints = history.map((h, i) => `${x(i)},${y(h.value)}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="max-w-full">
      {bands.map((b, i) => (
        <rect key={i} x={PAD_X} y={b.y1} width={WIDTH - PAD_X * 2} height={Math.max(0, b.y2 - b.y1)} fill={b.color} opacity={0.12} />
      ))}
      <polyline points={linePoints} fill="none" stroke="#0f172a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {history.map((h, i) => (
        <circle key={h.date} cx={x(i)} cy={y(h.value)} r={3} fill="#0f172a" />
      ))}
      {history.map((h, i) => (
        <text key={h.date} x={x(i)} y={HEIGHT - 1} textAnchor="middle" fontSize={10} fill="#9ca3af">
          {h.period}
        </text>
      ))}
    </svg>
  );
}
