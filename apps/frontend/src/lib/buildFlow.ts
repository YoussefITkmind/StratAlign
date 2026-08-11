import type { Node, Edge } from "@xyflow/react";
import { Objective, Dependency } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, LANE_HEIGHT, NODE_WIDTH, NODE_HEIGHT, COLUMN_WIDTH, COLUMN_START_X, LANE_LABEL_WIDTH } from "@/lib/mapConfig";

export function buildNodes(objectives: Objective[], targetWidth = 0): Node[] {
  const maxColumn = objectives.reduce((max, o) => Math.max(max, o.column), 0);
  const columnCount = maxColumn + 1;

  // Spread columns to fill the available width (down to a sensible minimum
  // per column), so cards fan out edge-to-edge instead of hugging the left.
  const availableInnerWidth = targetWidth - LANE_LABEL_WIDTH - COLUMN_START_X * 2;
  const columnWidth = Math.max(COLUMN_WIDTH, availableInnerWidth / columnCount);
  const laneWidth = LANE_LABEL_WIDTH + COLUMN_START_X * 2 + columnCount * columnWidth;

  const laneNodes: Node[] = PERSPECTIVE_ORDER.map((perspective, i) => ({
    id: `lane-${perspective}`,
    type: "lane",
    position: { x: 0, y: i * LANE_HEIGHT },
    style: { width: laneWidth, height: LANE_HEIGHT },
    data: { perspective },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }));

  const objectiveNodes: Node[] = objectives.map((objective) => {
    const laneIndex = PERSPECTIVE_ORDER.indexOf(objective.perspective);
    return {
      id: objective.id,
      type: "objective",
      position: {
        x: LANE_LABEL_WIDTH + COLUMN_START_X + objective.column * columnWidth + (columnWidth - NODE_WIDTH) / 2,
        y: laneIndex * LANE_HEIGHT + (LANE_HEIGHT - NODE_HEIGHT) / 2,
      },
      style: { width: NODE_WIDTH, height: NODE_HEIGHT },
      data: { objective },
    };
  });

  return [...laneNodes, ...objectiveNodes];
}

export function buildEdges(dependencies: Dependency[]): Edge[] {
  return dependencies.map((dep) => ({
    id: dep.id,
    source: dep.source,
    target: dep.target,
    type: "dependency",
    data: { depType: dep.type },
  }));
}
