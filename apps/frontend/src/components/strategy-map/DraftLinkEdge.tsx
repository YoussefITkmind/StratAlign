import { BaseEdge, getBezierPath, useInternalNode, type EdgeProps } from "@xyflow/react";
import { LinkStrength } from "@/types/strategyMap";
import { getEdgeParams } from "@/lib/floatingEdge";

interface DraftEdgeData {
  strength: LinkStrength;
  removed?: boolean;
  /** True for an already-published link being shown for context while editing — rendered solid, not dashed. */
  published?: boolean;
  [key: string]: unknown;
}

const STRENGTH_WIDTH: Record<LinkStrength, number> = { weak: 1, moderate: 2, strong: 3 };

/** Renders a link an analyst has proposed adding or removing — dashed to signal it isn't published yet. */
export default function DraftLinkEdge({ id, source, target, data }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
  const [path] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
    targetX: tx, targetY: ty, targetPosition: targetPos,
    curvature: 0.32,
  });

  const { strength, removed, published } = data as DraftEdgeData;

  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: removed ? "#ef4444" : published ? "#64748b" : "#3b82f6",
        strokeWidth: STRENGTH_WIDTH[strength],
        strokeDasharray: published ? undefined : "5 4",
        opacity: removed ? 0.5 : published ? 0.8 : 0.9,
      }}
    />
  );
}
