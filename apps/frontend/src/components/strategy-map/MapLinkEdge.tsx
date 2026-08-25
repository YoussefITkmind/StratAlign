import { BaseEdge, getBezierPath, Position, useInternalNode, type EdgeProps } from "@xyflow/react";
import { getEdgeParams } from "@/lib/floatingEdge";
import { LINK_CONFIG, type LinkStrength } from "@/lib/strategyMapVisualConfig";

interface LinkEdgeData {
  strength: LinkStrength;
  draft?: boolean;
  active?: boolean;
  dimmed?: boolean;
  sourceSlot?: number;
  sourceCount?: number;
  targetSlot?: number;
  targetCount?: number;
  routeBand?: number;
  [key: string]: unknown;
}

function slotOffset(index = 0, count = 1): number {
  if (count <= 1) return 0;
  const spacing = Math.min(16, 42 / Math.max(1, count - 1));
  return (index - (count - 1) / 2) * spacing;
}

function applyAttachmentOffset(
  x: number,
  y: number,
  position: Position,
  offset: number,
) {
  if (position === Position.Left || position === Position.Right) {
    return { x, y: y + offset };
  }
  return { x: x + offset, y };
}

export default function MapLinkEdge({ id, source, target, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const edgeData = data as LinkEdgeData;

  const sourcePoint = applyAttachmentOffset(
    sx,
    sy,
    sourcePos,
    slotOffset(edgeData.sourceSlot, edgeData.sourceCount),
  );
  const targetPoint = applyAttachmentOffset(
    tx,
    ty,
    targetPos,
    slotOffset(edgeData.targetSlot, edgeData.targetCount),
  );

  const routeBand = edgeData.routeBand ?? 2;
  const curvature = 0.24 + routeBand * 0.055;
  const [path] = getBezierPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    sourcePosition: sourcePos,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
    targetPosition: targetPos,
    curvature,
  });

  const { strength, draft, active, dimmed } = edgeData;
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
