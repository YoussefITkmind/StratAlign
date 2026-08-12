"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ArrowRight, ArrowLeft } from "lucide-react";
import { Objective, Dependency, DependencyType, PerspectiveKey } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG, DEPENDENCY_CONFIG, scoreStatus, STATUS_DOT } from "@/lib/mapConfig";

interface Props {
  objectives: Objective[];
  dependencies: Dependency[];
  perspectiveFilter: PerspectiveKey | "all";
  objectiveMatches: (o: Objective) => boolean;
  filtering: boolean;
  depsVisible: boolean;
  visibleDepTypes: Set<DependencyType>;
}

interface Connection {
  direction: "out" | "in";
  type: DependencyType;
  objective: Objective;
}

export default function MobileMapList({
  objectives,
  dependencies,
  perspectiveFilter,
  objectiveMatches,
  filtering,
  depsVisible,
  visibleDepTypes,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<PerspectiveKey>>(new Set());

  const byId = useMemo(() => {
    const map = new Map<string, Objective>();
    objectives.forEach((o) => map.set(o.id, o));
    return map;
  }, [objectives]);

  const connectionsByObjective = useMemo(() => {
    const map = new Map<string, Connection[]>();
    dependencies.forEach((dep) => {
      const source = byId.get(dep.source);
      const target = byId.get(dep.target);
      if (!source || !target) return;
      if (!map.has(dep.source)) map.set(dep.source, []);
      if (!map.has(dep.target)) map.set(dep.target, []);
      map.get(dep.source)!.push({ direction: "out", type: dep.type, objective: target });
      map.get(dep.target)!.push({ direction: "in", type: dep.type, objective: source });
    });
    return map;
  }, [dependencies, byId]);

  const toggleSection = (key: PerspectiveKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visiblePerspectives = PERSPECTIVE_ORDER.filter(
    (key) => perspectiveFilter === "all" || perspectiveFilter === key
  );

  return (
    <div className="flex flex-col gap-3">
      {visiblePerspectives.map((key) => {
        const cfg = PERSPECTIVE_CONFIG[key];
        const laneObjectives = objectives
          .filter((o) => o.perspective === key)
          .sort((a, b) => a.column - b.column);
        const shown = laneObjectives.filter((o) => !filtering || objectiveMatches(o));
        const isCollapsed = collapsed.has(key);

        if (filtering && shown.length === 0) return null;

        return (
          <div key={key} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <button
              onClick={() => toggleSection(key)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3"
              style={{ background: cfg.bandBg }}
            >
              <div className="flex items-center gap-2.5">
                <span className="h-6 w-1 rounded-full" style={{ background: cfg.accent }} />
                <div className="text-left">
                  <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: cfg.textColor }}>
                    {cfg.label}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {cfg.weight}% weight · {laneObjectives.length} objective{laneObjectives.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
              />
            </button>

            {!isCollapsed && (
              <div className="flex flex-col divide-y divide-gray-100 border-t border-gray-100">
                {shown.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-gray-400">No objectives match the current filters.</p>
                ) : (
                  shown.map((objective) => {
                    const status = scoreStatus(objective.score);
                    const connections = depsVisible
                      ? (connectionsByObjective.get(objective.id) ?? []).filter((c) => visibleDepTypes.has(c.type))
                      : [];
                    return (
                      <div key={objective.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-semibold leading-snug text-gray-900">{objective.title}</p>
                          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_DOT[status] }} />
                        </div>
                        <p className="mt-1 truncate text-xs text-gray-400">{objective.owner}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full" style={{ width: `${objective.score}%`, background: cfg.barColor }} />
                          </div>
                          <span className="shrink-0 text-xs font-medium text-gray-600">{objective.score}%</span>
                        </div>

                        {connections.length > 0 && (
                          <div className="mt-2.5 flex flex-col gap-1.5">
                            {connections.map((c, i) => {
                              const dcfg = DEPENDENCY_CONFIG[c.type];
                              return (
                                <div
                                  key={`${c.direction}-${i}`}
                                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px]"
                                  style={{ background: `${dcfg.color}14` }}
                                >
                                  {c.direction === "out" ? (
                                    <ArrowRight className="h-3 w-3 shrink-0" style={{ color: dcfg.color }} />
                                  ) : (
                                    <ArrowLeft className="h-3 w-3 shrink-0" style={{ color: dcfg.color }} />
                                  )}
                                  <span className="font-medium" style={{ color: dcfg.color }}>
                                    {dcfg.label}
                                  </span>
                                  <span className="truncate text-gray-600">{c.objective.title}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
