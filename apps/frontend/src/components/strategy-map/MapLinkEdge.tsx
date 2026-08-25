import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { getEdgeParams } from "@/lib/floatingEdge";
import { LINK_CONFIG, type LinkStrength } from "@/lib/strategyMapVisualConfig";

interface LinkEdgeData {
  strength: LinkStrength;
  draft?: boolean;
  active?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export default function MapLinkEdge({ id, source, target, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
    curvature: 0.32,
  });

  const { strength, draft, active, dimmed } = data as LinkEdgeData;
  const cfg = LINK_CONFIG[strength];

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={`url(#strategy-map-arrow-${strength})`}
      style={{
        stroke: cfg.color,
        strokeWidth: active ? Math.max(cfg.width + 0.75, 2.75) : cfg.width,
        strokeDasharray: cfg.dashed || draft ? "6 4" : undefined,
        opacity: dimmed ? 0.12 : draft ? 0.85 : active ? 1 : 0.9,
        transition: "opacity 150ms ease, stroke-width 150ms ease",
      }}
    />
  );
}
