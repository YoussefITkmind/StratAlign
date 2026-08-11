import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GripVertical } from "lucide-react";
import { Objective } from "@/types/strategyMap";
import { PERSPECTIVE_CONFIG, scoreStatus, STATUS_DOT } from "@/lib/mapConfig";

interface ObjectiveData {
  objective: Objective;
  dimmed?: boolean;
  active?: boolean;
  pendingSource?: boolean;
  connecting?: boolean;
  [key: string]: unknown;
}

const handleStyle = { opacity: 0, pointerEvents: "none" as const };

export default function ObjectiveNode({ data }: NodeProps) {
  const { objective, dimmed, active, pendingSource, connecting } = data as ObjectiveData;
  const cfg = PERSPECTIVE_CONFIG[objective.perspective];
  const status = scoreStatus(objective.score);
  const highlighted = active || pendingSource;

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between rounded-xl border bg-white p-3 shadow-sm transition-all duration-150"
      style={{
        borderColor: highlighted ? "#3b82f6" : "#e5e7eb",
        boxShadow: highlighted ? "0 0 0 3px rgba(59,130,246,0.15), 0 6px 14px rgba(0,0,0,0.08)" : "0 1px 2px rgba(0,0,0,0.04)",
        opacity: dimmed ? 0.35 : 1,
        filter: dimmed ? "grayscale(0.6)" : "none",
        cursor: connecting ? "crosshair" : "grab",
      }}
    >
      <Handle type="source" position={Position.Top} style={handleStyle} />
      <Handle type="target" position={Position.Top} style={handleStyle} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug text-gray-900">{objective.title}</p>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: cfg.bandBg }}>
          <GripVertical className="h-3 w-3" style={{ color: cfg.textColor }} />
        </span>
      </div>

      <div>
        <p className="mb-1.5 truncate text-[11px] text-gray-400">{objective.owner}</p>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${objective.score}%`, background: cfg.barColor }} />
          </div>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} />
          <span className="shrink-0 text-[11px] font-medium text-gray-600">{objective.score}%</span>
        </div>
      </div>
    </div>
  );
}
