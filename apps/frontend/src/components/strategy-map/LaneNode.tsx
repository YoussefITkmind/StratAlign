import type { NodeProps } from "@xyflow/react";
import { perspectiveColors } from "@/lib/strategyMapVisualConfig";

interface LaneData {
  nameEn: string;
  laneIndex: number;
  weight?: number;
  [key: string]: unknown;
}

export default function LaneNode({ data }: NodeProps) {
  const { nameEn, laneIndex, weight } = data as LaneData;
  const cfg = perspectiveColors(laneIndex);

  return (
    <div className="relative h-full w-full" style={{ background: cfg.bandBg }}>
      <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: cfg.accent }} />
      <div className="absolute left-4 top-3 select-none">
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: cfg.textColor }}>
          {nameEn}
        </p>
        {weight != null && <p className="mt-0.5 text-[10px] text-gray-400">{weight}% weight</p>}
      </div>
    </div>
  );
}
