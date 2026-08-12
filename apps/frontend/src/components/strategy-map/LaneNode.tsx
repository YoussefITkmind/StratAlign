import type { NodeProps } from "@xyflow/react";
import { PerspectiveKey } from "@/types/strategyMap";
import { PERSPECTIVE_CONFIG } from "@/lib/mapConfig";

interface LaneData {
  perspective: PerspectiveKey;
  /** Real scorecard perspective name/weight, when this lane backs a real Perspective row rather than the fixed 4-lane mock taxonomy. */
  label?: string;
  weightLabel?: string;
  dimmed?: boolean;
  [key: string]: unknown;
}

export default function LaneNode({ data }: NodeProps) {
  const { perspective, label, weightLabel, dimmed } = data as LaneData;
  const cfg = PERSPECTIVE_CONFIG[perspective];

  return (
    <div
      className="relative h-full w-full transition-all duration-200"
      style={{ background: cfg.bandBg, opacity: dimmed ? 0.45 : 1, filter: dimmed ? "grayscale(0.6)" : "none" }}
    >
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: cfg.accent }} />
      <div className="absolute left-4 top-3 select-none">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.textColor }}>
          {label ?? cfg.label}
        </p>
        <p className="text-[10px] text-gray-400">{weightLabel ?? `${cfg.weight}% weight`}</p>
      </div>
    </div>
  );
}
