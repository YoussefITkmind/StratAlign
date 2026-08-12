import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { DependencyType } from "@/types/strategyMap";
import { DEPENDENCY_CONFIG } from "@/lib/mapConfig";
import { getEdgeParams } from "@/lib/floatingEdge";

interface EdgeData {
  depType: DependencyType;
  dimmed?: boolean;
  active?: boolean;
  [key: string]: unknown;
}

export default function DependencyEdge({ id, source, target, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
    curvature: 0.32,
  });

  const { depType, dimmed, active } = data as EdgeData;
  const cfg = DEPENDENCY_CONFIG[depType];

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={`url(#strategy-map-arrow-${depType})`}
      style={{
        stroke: cfg.color,
        strokeWidth: active ? 2.5 : 1.75,
        strokeDasharray: cfg.dashed ? "6 4" : undefined,
        opacity: dimmed ? 0.12 : 1,
        transition: "opacity 150ms ease, stroke-width 150ms ease",
      }}
    />
  );
}
