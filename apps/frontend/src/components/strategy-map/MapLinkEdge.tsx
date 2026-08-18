import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { getEdgeParams } from "@/lib/floatingEdge";
import { LINK_CONFIG, type LinkStrength } from "@/lib/strategyMapVisualConfig";

interface LinkEdgeData {
  strength: LinkStrength;
  draft?: boolean;
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

  const { strength, draft } = data as LinkEdgeData;
  const cfg = LINK_CONFIG[strength];

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={`url(#strategy-map-arrow-${strength})`}
      style={{
        stroke: draft ? "#3b82f6" : cfg.color,
        strokeWidth: cfg.width,
        strokeDasharray: draft ? "5 4" : undefined,
        opacity: draft ? 0.9 : 1,
      }}
    />
  );
}
