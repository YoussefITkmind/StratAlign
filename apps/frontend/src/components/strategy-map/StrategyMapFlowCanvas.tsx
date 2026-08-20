"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler, type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { buildLaneAndObjectiveNodes, buildLinkEdges, type MapPerspective, type MapPlacement, type MapLinkRow } from "@/lib/buildStrategyMapFlow";
import { LANE_HEIGHT } from "@/lib/strategyMapVisualConfig";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import MapLinkEdge from "./MapLinkEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";
import ZoomControls from "./ZoomControls";

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { mapLink: MapLinkEdge };

interface StrategyMapFlowCanvasProps {
  perspectives: MapPerspective[];
  placements: MapPlacement[];
  links: MapLinkRow[];
  editing: boolean;
  selectedObjectiveId: string | null;
  onSelectObjective: (objectiveId: string) => void;
  onRemoveLink?: (linkId: string) => void;
  connecting?: boolean;
  pendingSourceId?: string | null;
  infoLabel?: ReactNode;
}

function FlowCanvas({ perspectives, placements, links, editing, selectedObjectiveId, onSelectObjective, onRemoveLink, connecting, pendingSourceId, infoLabel }: StrategyMapFlowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);

  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const contentHeight = Math.max(perspectives.length, 1) * LANE_HEIGHT;
    const targetWidth = rect && rect.width > 0 && rect.height > 0 ? (rect.width / rect.height) * contentHeight : 0;

    setNodes(
      buildLaneAndObjectiveNodes(perspectives, placements, targetWidth).map((node) =>
        node.type === "objective"
          ? { ...node, data: { ...node.data, active: node.id === selectedObjectiveId, pendingSource: node.id === pendingSourceId, connecting } }
          : node,
      ),
    );
    setEdges(buildLinkEdges(links, editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectives, placements, links, editing, selectedObjectiveId, connecting, pendingSourceId]);

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type !== "objective") return;
    onSelectObjective(node.id);
  };

  const handleEdgeClick: EdgeMouseHandler = (_, edge) => {
    onRemoveLink?.(edge.id);
  };

  return (
    <div ref={canvasRef} data-testid="strategy-map-canvas" className="relative h-[65vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-gray-200">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onMove={(_, viewport) => setZoomPct(Math.round(viewport.zoom * 100))}
        nodesDraggable={false}
        nodesConnectable={false}
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
      {infoLabel && <div className="absolute left-3 top-3 z-10">{infoLabel}</div>}
      <EdgeMarkerDefs />
    </div>
  );
}

export default function StrategyMapFlowCanvas(props: StrategyMapFlowCanvasProps) {
  const perspectiveCount = useMemo(() => props.perspectives.length, [props.perspectives]);
  if (perspectiveCount === 0) {
    return <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">No perspectives configured for this scorecard.</p>;
  }
  return (
    <ReactFlowProvider>
      <FlowCanvas {...props} />
    </ReactFlowProvider>
  );
}
