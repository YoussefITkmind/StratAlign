"use client";

import { useEffect, useRef, useState } from "react";
import { ReactFlow, Background, BackgroundVariant, useNodesState, useEdgesState, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Map as MapIcon } from "lucide-react";
import { StrategyMap } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, LANE_HEIGHT } from "@/lib/mapConfig";
import { buildNodes, buildEdges } from "@/lib/buildFlow";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import DependencyEdge from "./DependencyEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";
import ZoomControls from "./ZoomControls";

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { dependency: DependencyEdge };

/**
 * Presentational, non-editable rendering of a single StrategyMap — used by the
 * Master Scorecard grid/map toggle (screen 03). Deliberately a separate
 * component rather than a "readOnly" prop on StrategyMapPage: that page owns
 * its own multi-map tab state, search/filter, and edit interactions (drag,
 * connect-mode) which don't apply here, and reusing it as-is would mean
 * carrying all of that just to view one map.
 */
export default function ReadOnlyMapView({ map }: { map: StrategyMap }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);

  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const contentHeight = PERSPECTIVE_ORDER.length * LANE_HEIGHT;
    const targetWidth = rect && rect.width > 0 && rect.height > 0 ? (rect.width / rect.height) * contentHeight : 0;
    setNodes(buildNodes(map.objectives, targetWidth));
    setEdges(buildEdges(map.dependencies));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <div ref={canvasRef} data-testid="scorecard-map-view" className="relative h-[60vh] min-h-[480px] w-full overflow-hidden rounded-xl border border-gray-200">
      <div className="absolute start-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <MapIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <p className="truncate text-sm font-semibold text-gray-900">{map.name}</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-400">
          {map.period} · {map.objectives.length} objectives · read-only
        </p>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onMove={(_, viewport) => setZoomPct(Math.round(viewport.zoom * 100))}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        className="bg-[#fafbfc]"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#e2e8f0" />
        <ZoomControls zoomPct={zoomPct} />
      </ReactFlow>
      <EdgeMarkerDefs />
    </div>
  );
}
