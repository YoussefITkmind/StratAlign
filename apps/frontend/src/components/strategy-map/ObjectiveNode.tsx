import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";
import type { MapPlacement } from "@/lib/buildStrategyMapFlow";
import { STATUS_DOT, perspectiveColors } from "@/lib/strategyMapVisualConfig";

interface ObjectiveData {
  placement: MapPlacement;
  laneIndex: number;
  active?: boolean;
  pendingSource?: boolean;
  connecting?: boolean;
  [key: string]: unknown;
}

const handleStyle = { opacity: 0, pointerEvents: "none" as const };

export default function ObjectiveNode({ data }: NodeProps) {
  const { placement, laneIndex, active, pendingSource, connecting } = data as ObjectiveData;
  const cfg = perspectiveColors(laneIndex);
  const highlighted = active || pendingSource;

  return (
    <div
      data-testid={`map-objective-${placement.objectiveNodeId}`}
      className="relative flex h-full w-full flex-col justify-between rounded-xl border bg-white p-3 shadow-sm transition-all duration-150"
      style={{
        borderColor: highlighted ? "#3b82f6" : "#e5e7eb",
        boxShadow: highlighted ? "0 0 0 3px rgba(59,130,246,0.15), 0 6px 14px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.04)",
        cursor: connecting ? "crosshair" : "pointer",
      }}
    >
      <Handle type="source" position={Position.Top} style={handleStyle} />
      <Handle type="target" position={Position.Top} style={handleStyle} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug text-gray-900">{placement.objectiveNameEn}</p>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: cfg.bandBg }}>
          <GripVertical className="h-3 w-3" style={{ color: cfg.textColor }} />
        </span>
      </div>

      <div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: placement.status ? STATUS_DOT[placement.status] : "#d1d5db" }}
          />
          <span className="shrink-0 truncate text-[11px] font-medium text-gray-600">
            {placement.kpiNameEn ?? "No KPI linked"}
          </span>
        </div>
      </div>
    </div>
  );
}
