"use client";

import { useEffect, useRef } from "react";
import { ReactFlow, useNodesState, useEdgesState, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { StrategyMap } from "@/types/strategyMap";
import { buildNodes, buildEdges } from "@/lib/buildFlow";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import DependencyEdge from "./DependencyEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { dependency: DependencyEdge };

/**
 * A small, fully static preview of a StrategyMap for the Home landing widget —
 * unlike ReadOnlyMapView (used by the Master Scorecard map toggle), this has
 * no zoom/pan controls at all: it's a thumbnail meant to be glanced at and
 * clicked through to the real canvas, not explored in place.
 */
export default function MapThumbnail({ map }: { map: StrategyMap }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    setNodes(buildNodes(map.objectives, rect?.width ?? 0));
    setEdges(buildEdges(map.dependencies));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return (
    <div
      ref={canvasRef}
      data-testid="map-thumbnail-canvas"
      className="h-[220px] w-full overflow-hidden rounded-xl border border-gray-100 bg-[#fafbfc]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <EdgeMarkerDefs />
      </ReactFlow>
    </div>
  );
}
