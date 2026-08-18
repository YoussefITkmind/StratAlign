import type { Node, Edge } from "@xyflow/react";
import {
  LANE_HEIGHT, NODE_WIDTH, NODE_HEIGHT, COLUMN_WIDTH, COLUMN_START_X, LANE_LABEL_WIDTH,
} from "@/lib/strategyMapVisualConfig";

export interface MapPerspective { id: string; nameEn: string; nameAr: string; order: number }
export interface MapPlacement {
  perspectiveId: string;
  objectiveNodeId: string;
  objectiveNameEn: string;
  objectiveNameAr: string;
  kpiNameEn: string | null;
  status: "on_track" | "watch" | "off_track" | null;
}
export interface MapLinkRow {
  id: string;
  fromObjectiveId: string;
  toObjectiveId: string;
  strength: "weak" | "strong";
}

export function buildLaneAndObjectiveNodes(
  perspectives: MapPerspective[],
  placements: MapPlacement[],
  targetWidth = 0,
): Node[] {
  const orderedPerspectives = [...perspectives].sort((a, b) => a.order - b.order);
  const placementsByLane = orderedPerspectives.map((perspective) =>
    placements.filter((placement) => placement.perspectiveId === perspective.id),
  );
  const maxColumn = placementsByLane.reduce((max, rows) => Math.max(max, rows.length - 1), 0);
  const columnCount = maxColumn + 1;

  const availableInnerWidth = targetWidth - LANE_LABEL_WIDTH - COLUMN_START_X * 2;
  const columnWidth = Math.max(COLUMN_WIDTH, availableInnerWidth / columnCount);
  const laneWidth = LANE_LABEL_WIDTH + COLUMN_START_X * 2 + columnCount * columnWidth;

  const laneNodes: Node[] = orderedPerspectives.map((perspective, laneIndex) => ({
    id: `lane-${perspective.id}`,
    type: "lane",
    position: { x: 0, y: laneIndex * LANE_HEIGHT },
    style: { width: laneWidth, height: LANE_HEIGHT },
    data: { nameEn: perspective.nameEn, nameAr: perspective.nameAr, laneIndex },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }));

  const objectiveNodes: Node[] = orderedPerspectives.flatMap((_, laneIndex) =>
    placementsByLane[laneIndex].map((placement, column) => ({
      id: placement.objectiveNodeId,
      type: "objective",
      position: {
        x: LANE_LABEL_WIDTH + COLUMN_START_X + column * columnWidth + (columnWidth - NODE_WIDTH) / 2,
        y: laneIndex * LANE_HEIGHT + (LANE_HEIGHT - NODE_HEIGHT) / 2,
      },
      style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      data: { placement, laneIndex },
    })),
  );

  return [...laneNodes, ...objectiveNodes];
}

export function buildLinkEdges(links: MapLinkRow[], editing: boolean): Edge[] {
  return links.map((link) => ({
    id: link.id,
    source: link.fromObjectiveId,
    target: link.toObjectiveId,
    type: "mapLink",
    data: { strength: link.strength, draft: editing },
  }));
}
