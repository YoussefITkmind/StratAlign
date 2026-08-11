"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CadenceTask, Kpi, RollupMethod, RuleDefinition, VersionChangeType } from "@/types/kpi";
import { evaluateStatus } from "@/lib/ruleEngine";
import { initialKpis, initialRules } from "@/data/mockKpiData";
import { initialCadenceTasks } from "@/data/mockCadenceTasks";

interface KpiStoreValue {
  kpis: Kpi[];
  rules: Record<string, RuleDefinition>;
  cadenceTasks: CadenceTask[];
  addKpi: (kpi: Kpi) => void;
  updateKpi: (id: string, patch: Partial<Kpi>) => void;
  addVersionEntry: (kpiId: string, entry: { editedBy: string; editedAt: string; changeType: VersionChangeType; summary: string }) => void;
  retireKpi: (id: string, note: string) => void;
  updateRule: (ruleId: string, patch: Partial<RuleDefinition>) => void;
  publishRule: (ruleId: string) => void;
  setRollup: (kpiId: string, method: RollupMethod) => void;
  recordMeasurement: (kpiId: string, value: number, period: string) => void;
  setCadenceTaskState: (taskId: string, state: CadenceTask["state"]) => void;
}

const KpiStoreContext = createContext<KpiStoreValue | null>(null);

export function KpiStoreProvider({ children }: { children: ReactNode }) {
  const [kpis, setKpis] = useState<Kpi[]>(initialKpis);
  const [rules, setRules] = useState<Record<string, RuleDefinition>>(initialRules);
  const [cadenceTasks, setCadenceTasks] = useState<CadenceTask[]>(initialCadenceTasks);

  const addKpi = useCallback((kpi: Kpi) => {
    setKpis((prev) => [...prev, kpi]);
  }, []);

  const updateKpi = useCallback((id: string, patch: Partial<Kpi>) => {
    setKpis((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }, []);

  const addVersionEntry = useCallback((kpiId: string, entry: { editedBy: string; editedAt: string; changeType: VersionChangeType; summary: string }) => {
    setKpis((prev) =>
      prev.map((k) => {
        if (k.id !== kpiId) return k;
        const nextVersion = (k.versions.at(-1)?.version ?? 0) + 1;
        return { ...k, versions: [...k.versions, { id: `${kpiId}-v${nextVersion}`, version: nextVersion, ...entry }] };
      })
    );
  }, []);

  const retireKpi = useCallback((id: string, note: string) => {
    setKpis((prev) =>
      prev.map((k) => {
        if (k.id !== id) return k;
        const nextVersion = (k.versions.at(-1)?.version ?? 0) + 1;
        return {
          ...k,
          retired: true,
          retiredNote: note,
          versions: [...k.versions, { id: `${id}-v${nextVersion}`, version: nextVersion, editedBy: k.owner.name, editedAt: new Date().toISOString(), changeType: "retired", summary: note ? `Retired: ${note}` : "KPI retired." }],
        };
      })
    );
  }, []);

  const updateRule = useCallback((ruleId: string, patch: Partial<RuleDefinition>) => {
    setRules((prev) => ({ ...prev, [ruleId]: { ...prev[ruleId], ...patch } }));
  }, []);

  const publishRule = useCallback((ruleId: string) => {
    setRules((prev) => {
      const current = prev[ruleId];
      if (!current) return prev;
      return { ...prev, [ruleId]: { ...current, active: true, version: current.version + 1 } };
    });
    setKpis((prev) =>
      prev.map((k) => {
        if (k.ruleId !== ruleId) return k;
        const rule = rules[ruleId];
        const status = rule ? evaluateStatus(k.actual, rule) : k.status;
        const nextVersion = (k.versions.at(-1)?.version ?? 0) + 1;
        return {
          ...k,
          status,
          versions: [...k.versions, { id: `${k.id}-v${nextVersion}`, version: nextVersion, editedBy: k.owner.name, editedAt: new Date().toISOString(), changeType: "threshold", summary: "Threshold rule published." }],
        };
      })
    );
  }, [rules]);

  const setRollup = useCallback((kpiId: string, method: RollupMethod) => {
    setKpis((prev) => prev.map((k) => (k.id === kpiId ? { ...k, rollupMethod: method } : k)));
  }, []);

  const recordMeasurement = useCallback((kpiId: string, value: number, period: string) => {
    setKpis((prev) =>
      prev.map((k) => {
        if (k.id !== kpiId) return k;
        const rule = rules[k.ruleId];
        const status = rule ? evaluateStatus(value, rule) : k.status;
        return { ...k, actual: value, status, history: [...k.history, { period, date: new Date().toISOString(), value }] };
      })
    );
  }, [rules]);

  const setCadenceTaskState = useCallback((taskId: string, state: CadenceTask["state"]) => {
    setCadenceTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, state } : t)));
  }, []);

  const value = useMemo(
    () => ({ kpis, rules, cadenceTasks, addKpi, updateKpi, addVersionEntry, retireKpi, updateRule, publishRule, setRollup, recordMeasurement, setCadenceTaskState }),
    [kpis, rules, cadenceTasks, addKpi, updateKpi, addVersionEntry, retireKpi, updateRule, publishRule, setRollup, recordMeasurement, setCadenceTaskState]
  );

  return <KpiStoreContext.Provider value={value}>{children}</KpiStoreContext.Provider>;
}

export function useKpiStore(): KpiStoreValue {
  const ctx = useContext(KpiStoreContext);
  if (!ctx) throw new Error("useKpiStore must be used within a KpiStoreProvider");
  return ctx;
}
