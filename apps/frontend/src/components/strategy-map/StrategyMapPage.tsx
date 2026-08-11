"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, BackgroundVariant, useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler, type OnNodeDrag, type OnMove,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search, Download, Plus, Link2, X, Map as MapIcon,
} from "lucide-react";
import { Objective, Dependency, DependencyType, PerspectiveKey, StatusFilter, StrategyMap } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG, DEPENDENCY_ORDER, DEPENDENCY_CONFIG, LANE_HEIGHT, scoreStatus } from "@/lib/mapConfig";
import { buildNodes, buildEdges } from "@/lib/buildFlow";
import { initialMaps } from "@/data/mockMapData";
import { useIsMobile } from "@/lib/useIsMobile";
import LaneNode from "./LaneNode";
import ObjectiveNode from "./ObjectiveNode";
import DependencyEdge from "./DependencyEdge";
import EdgeMarkerDefs from "./EdgeMarkerDefs";
import DependencyLegend from "./DependencyLegend";
import ZoomControls from "./ZoomControls";
import AddObjectiveModal from "./AddObjectiveModal";
import NewMapModal from "./NewMapModal";
import MobileMapList from "./MobileMapList";

const nodeTypes = { lane: LaneNode, objective: ObjectiveNode };
const edgeTypes = { dependency: DependencyEdge };

export default function StrategyMapPage() {
  const [mapCache, setMapCache] = useState<Record<string, StrategyMap>>(() =>
    Object.fromEntries(initialMaps.map((m) => [m.id, m]))
  );
  const [mapOrder, setMapOrder] = useState<string[]>(initialMaps.map((m) => m.id));
  const [activeMapId, setActiveMapId] = useState(initialMaps[0].id);
  const activeMap = mapCache[activeMapId];

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!activeMap) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const contentHeight = PERSPECTIVE_ORDER.length * LANE_HEIGHT;
    const targetWidth = rect && rect.width > 0 && rect.height > 0 ? (rect.width / rect.height) * contentHeight : 0;
    setNodes(buildNodes(activeMap.objectives, targetWidth));
    setEdges(buildEdges(activeMap.dependencies));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMapId, activeMap]);

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const activeId = draggingId ?? hoveredId;

  const [connectMode, setConnectMode] = useState(false);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [connectType, setConnectType] = useState<DependencyType>("enables");

  const [search, setSearch] = useState("");
  const [perspectiveFilter, setPerspectiveFilter] = useState<PerspectiveKey | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter | "all">("all");
  const [depsVisible, setDepsVisible] = useState(true);
  const [visibleDepTypes, setVisibleDepTypes] = useState<Set<DependencyType>>(new Set(DEPENDENCY_ORDER));

  const [addObjectiveOpen, setAddObjectiveOpen] = useState(false);
  const [newMapOpen, setNewMapOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);

  const filtering = perspectiveFilter !== "all" || statusFilter !== "all" || search.trim() !== "";

  const objectiveMatches = useCallback(
    (o: Objective) => {
      if (perspectiveFilter !== "all" && o.perspective !== perspectiveFilter) return false;
      if (statusFilter !== "all" && scoreStatus(o.score) !== statusFilter) return false;
      const term = search.trim().toLowerCase();
      if (term && !o.title.toLowerCase().includes(term) && !o.owner.toLowerCase().includes(term)) return false;
      return true;
    },
    [perspectiveFilter, statusFilter, search]
  );

  const connectedIds = useMemo(() => {
    const set = new Set<string>();
    if (!activeId) return set;
    edges.forEach((e) => {
      if (e.source === activeId) set.add(e.target);
      if (e.target === activeId) set.add(e.source);
    });
    return set;
  }, [activeId, edges]);

  const displayedNodes = useMemo(() => {
    return nodes.map((n) => {
      if (n.type === "lane") {
        const perspective = (n.data as { perspective: PerspectiveKey }).perspective;
        const laneObjectives = nodes.filter(
          (o) => o.type === "objective" && (o.data as { objective: Objective }).objective.perspective === perspective
        );
        const laneActive = activeId ? laneObjectives.some((o) => o.id === activeId || connectedIds.has(o.id)) : false;
        const laneMatches = laneObjectives.some((o) => objectiveMatches((o.data as { objective: Objective }).objective));
        const dimmed = (activeId ? !laneActive : false) || (filtering && !laneMatches);
        return { ...n, data: { ...n.data, dimmed } };
      }
      const objective = (n.data as { objective: Objective }).objective;
      const isActive = n.id === activeId;
      const isConnected = connectedIds.has(n.id);
      const dimmed = (activeId ? !isActive && !isConnected : false) || (filtering && !objectiveMatches(objective));
      return {
        ...n,
        data: { ...n.data, dimmed, active: isActive, pendingSource: pendingSource === n.id, connecting: connectMode },
      };
    });
  }, [nodes, activeId, connectedIds, filtering, objectiveMatches, connectMode, pendingSource]);

  const displayedEdges = useMemo(() => {
    return edges
      .filter((e) => depsVisible && visibleDepTypes.has((e.data as { depType: DependencyType }).depType))
      .map((e) => {
        const isActive = activeId != null && (e.source === activeId || e.target === activeId);
        return { ...e, data: { ...e.data, dimmed: activeId != null && !isActive, active: isActive } };
      });
  }, [edges, activeId, depsVisible, visibleDepTypes]);

  const handleNodeMouseEnter: NodeMouseHandler = useCallback((_, node) => {
    if (node.type === "objective") setHoveredId(node.id);
  }, []);
  const handleNodeMouseLeave: NodeMouseHandler = useCallback(() => setHoveredId(null), []);
  const handleNodeDragStart: OnNodeDrag = useCallback((_, node) => setDraggingId(node.id), []);
  const handleNodeDragStop: OnNodeDrag = useCallback(() => setDraggingId(null), []);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (!connectMode || node.type !== "objective") return;
      if (!pendingSource) {
        setPendingSource(node.id);
        return;
      }
      if (pendingSource === node.id) {
        setPendingSource(null);
        return;
      }
      const newDep: Dependency = { id: `dep-${Date.now()}`, source: pendingSource, target: node.id, type: connectType };
      setMapCache((prev) => {
        const map = prev[activeMapId];
        if (!map) return prev;
        return { ...prev, [activeMapId]: { ...map, dependencies: [...map.dependencies, newDep] } };
      });
      setPendingSource(null);
    },
    [connectMode, pendingSource, connectType, activeMapId]
  );

  const handleMove: OnMove = useCallback((_, viewport) => setZoomPct(Math.round(viewport.zoom * 100)), []);

  const addObjective = (objective: Objective) => {
    setMapCache((prev) => {
      const map = prev[activeMapId];
      if (!map) return prev;
      return { ...prev, [activeMapId]: { ...map, objectives: [...map.objectives, objective] } };
    });
  };

  const nextColumn = (perspective: PerspectiveKey) => {
    const cols = (activeMap?.objectives ?? []).filter((o) => o.perspective === perspective).map((o) => o.column);
    return cols.length ? Math.max(...cols) + 1 : 0;
  };

  const createMap = (map: StrategyMap) => {
    setMapCache((prev) => ({ ...prev, [map.id]: map }));
    setMapOrder((prev) => [...prev, map.id]);
    setActiveMapId(map.id);
  };

  const toggleDepType = (type: DependencyType) => {
    setVisibleDepTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const exportJson = () => {
    if (!activeMap) return;
    const blob = new Blob([JSON.stringify(activeMap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeMap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!activeMap) return null;

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
      {/* map tabs + actions */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
            <MapIcon className="h-4 w-4 text-gray-500" />
          </span>
          {mapOrder.map((id) => {
            const map = mapCache[id];
            if (!map) return null;
            const active = id === activeMapId;
            return (
              <button
                key={id}
                onClick={() => setActiveMapId(id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {map.name}
              </button>
            );
          })}
          <button
            onClick={() => setNewMapOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 hover:border-gray-400 hover:text-gray-600"
          >
            <Plus className="h-3.5 w-3.5" /> New Map
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isMobile && (
            <button
              onClick={() => {
                setConnectMode((v) => !v);
                setPendingSource(null);
              }}
              className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium ${
                connectMode ? "border-slate-900 bg-slate-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Link2 className="h-4 w-4" /> Connect Nodes
            </button>
          )}
          <button
            onClick={() => setAddObjectiveOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Add Objective
          </button>
          <button onClick={exportJson} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* toolbar */}
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-auto">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search objectives..."
                className="w-full rounded-full border border-gray-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:w-56"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setPerspectiveFilter("all")}
                className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                  perspectiveFilter === "all" ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                All
              </button>
              {PERSPECTIVE_ORDER.map((key) => {
                const cfg = PERSPECTIVE_CONFIG[key];
                const active = perspectiveFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPerspectiveFilter(active ? "all" : key)}
                    className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      active ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter | "all")}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 outline-none focus:border-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="on-track">On Track</option>
              <option value="at-risk">At Risk</option>
              <option value="off-track">Off Track</option>
            </select>
            <button
              onClick={() => setDepsVisible((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium ${
                depsVisible ? "bg-slate-900 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Link2 className="h-3.5 w-3.5" /> Dependencies
            </button>
          </div>

          {depsVisible && <DependencyLegend visibleTypes={visibleDepTypes} onToggle={toggleDepType} />}
        </div>
      </div>

      {/* connect-mode banner */}
      {!isMobile && connectMode && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white">
          <p className="text-sm">
            {pendingSource ? "Click the target objective to connect it." : "Pick a relationship type, then click a source objective."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {DEPENDENCY_ORDER.map((type) => {
              const cfg = DEPENDENCY_CONFIG[type];
              const on = connectType === type;
              return (
                <button
                  key={type}
                  onClick={() => setConnectType(type)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: on ? "rgba(255,255,255,0.15)" : "transparent", boxShadow: on ? `inset 0 0 0 1px ${cfg.color}` : undefined }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.color }} />
                  {cfg.label}
                </button>
              );
            })}
            <button
              onClick={() => {
                setConnectMode(false);
                setPendingSource(null);
              }}
              className="rounded-full p-1 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* map summary */}
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{activeMap.name}</p>
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {activeMap.period} · {activeMap.objectives.length} objectives · {activeMap.dependencies.length} connections
          </p>
        </div>
      </div>

      {isMobile ? (
        <MobileMapList
          objectives={activeMap.objectives}
          dependencies={activeMap.dependencies}
          perspectiveFilter={perspectiveFilter}
          objectiveMatches={objectiveMatches}
          filtering={filtering}
          depsVisible={depsVisible}
          visibleDepTypes={visibleDepTypes}
        />
      ) : (
        <div ref={canvasRef} className="relative h-[70vh] min-h-[560px] w-full overflow-hidden rounded-xl border border-gray-200">
          <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="truncate text-sm font-semibold text-gray-900">{activeMap.name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-400">
              {activeMap.period} · {activeMap.objectives.length} objectives · {activeMap.dependencies.length} connections
            </p>
          </div>

          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onNodeDragStart={handleNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onMove={handleMove}
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
      )}

      {addObjectiveOpen && (
        <AddObjectiveModal onClose={() => setAddObjectiveOpen(false)} onAdd={addObjective} nextColumn={nextColumn} />
      )}
      {newMapOpen && <NewMapModal onClose={() => setNewMapOpen(false)} onCreate={createMap} />}
    </div>
  );
}
