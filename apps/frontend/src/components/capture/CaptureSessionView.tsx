"use client";

import { useRef, useState } from "react";
import { ArrowLeft, AlertTriangle, Save, Send, RotateCcw, Upload, FileSpreadsheet } from "lucide-react";
import { formatValue } from "@/lib/kpiConfig";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";

/**
 * Manual/template capture path only (per TSD-10 phase 2 scope). The row-level
 * validation below (type/range/plausibility) is intentionally simple and
 * self-contained so the Phase 6 DuckDB-based reconciliation framework can
 * subsume/replace it rather than duplicate it.
 */

interface BulkRow {
  period: string;
  rawValue: string;
  value: number | null;
  outcome: "accepted" | "rejected" | "warning";
  reason?: string;
}

const PLAUSIBILITY_THRESHOLD = 0.3;

export default function CaptureSessionView({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const { cadenceTasks, kpis, recordMeasurement, setCadenceTaskState } = useKpiStore();
  const task = cadenceTasks.find((t) => t.id === taskId);
  const kpi = kpis.find((k) => k.id === task?.kpiId);

  const [value, setValue] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!task || !kpi) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-gray-500">This capture task couldn&apos;t be found.</p>
        <button onClick={onBack} className="mt-3 text-sm font-medium text-blue-600">← Back to Data Capture</button>
      </div>
    );
  }

  const priorValue = kpi.actual;
  const numericValue = value.trim() === "" ? null : Number(value);
  const isValid = numericValue !== null && !Number.isNaN(numericValue);
  const deviation = isValid && priorValue !== 0 ? Math.abs((numericValue! - priorValue) / priorValue) : 0;
  const showPlausibilityWarning = isValid && deviation > PLAUSIBILITY_THRESHOLD;

  const saveDraft = () => {
    setCadenceTaskState(task.id, "draft");
  };

  const submit = () => {
    if (!isValid) return;
    recordMeasurement(kpi.id, numericValue!, task.period);
    setCadenceTaskState(task.id, "submitted");
  };

  const recall = () => {
    setCadenceTaskState(task.id, "draft");
  };

  const downloadTemplate = () => {
    const csv = `period,value\n${task.period},${kpi.actual}\n`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kpi.id}-capture-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleBulkFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").trim().split(/\r?\n/);
      const [, ...dataLines] = lines;
      const rows: BulkRow[] = dataLines.filter(Boolean).map((line) => {
        const [period, rawValue] = line.split(",").map((c) => c.trim());
        const parsed = Number(rawValue);
        if (!period || rawValue === undefined || Number.isNaN(parsed)) {
          return { period: period ?? "(unknown)", rawValue, value: null, outcome: "rejected", reason: "Non-numeric or incomplete value" };
        }
        const dev = priorValue !== 0 ? Math.abs((parsed - priorValue) / priorValue) : 0;
        if (dev > PLAUSIBILITY_THRESHOLD) {
          return { period, rawValue, value: parsed, outcome: "warning", reason: `Deviates ${Math.round(dev * 100)}% from the prior value` };
        }
        return { period, rawValue, value: parsed, outcome: "accepted" };
      });
      setBulkRows(rows);
    };
    reader.readAsText(file);
  };

  const commitBulk = () => {
    if (!bulkRows) return;
    bulkRows.filter((r) => r.outcome !== "rejected" && r.value !== null).forEach((r) => {
      recordMeasurement(kpi.id, r.value as number, r.period);
    });
    setCadenceTaskState(task.id, "submitted");
    setBulkRows(null);
  };

  return (
    <div className="mx-auto max-w-[720px]">
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Data Capture
      </button>

      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">{kpi.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{task.period} · Due {new Date(task.dueDate).toLocaleDateString()}</p>
      </div>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Manual Entry</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-400">Prior value</p>
            <p className="text-sm font-semibold text-gray-700">{formatValue(priorValue, kpi.unit)}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New value</label>
            <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
          </div>
        </div>

        {showPlausibilityWarning && (
          <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" /> This value deviates {Math.round(deviation * 100)}% from the prior value — double-check before submitting.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <span className="text-xs text-gray-400">Status: <span className="font-medium capitalize text-gray-600">{task.state.replace("-", " ")}</span></span>
          <div className="flex gap-2">
            {task.state === "submitted" ? (
              <button onClick={recall} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <RotateCcw className="h-3.5 w-3.5" /> Recall
              </button>
            ) : (
              <>
                <button onClick={saveDraft} className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  <Save className="h-3.5 w-3.5" /> Save Draft
                </button>
                <button onClick={submit} disabled={!isValid} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">
                  <Send className="h-3.5 w-3.5" /> Submit
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Bulk Template Upload</h2>
        {!bulkRows ? (
          <div className="space-y-3">
            <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
              <FileSpreadsheet className="h-4 w-4" /> Download CSV template
            </button>
            <button onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 py-8 text-sm text-gray-500 hover:border-gray-400 hover:bg-gray-50">
              <Upload className="h-4 w-4" /> Choose a completed CSV to upload
            </button>
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleBulkFile(e.target.files[0])} />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="divide-y divide-gray-100">
                {bulkRows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{r.period} — {r.rawValue}</p>
                      {r.reason && <p className={`text-xs ${r.outcome === "rejected" ? "text-red-500" : "text-amber-600"}`}>{r.reason}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.outcome === "accepted" ? "bg-emerald-50 text-emerald-700" : r.outcome === "warning" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"
                    }`}>
                      {r.outcome === "accepted" ? "Accepted" : r.outcome === "warning" ? "Warning" : "Rejected"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBulkRows(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Choose different file</button>
              <button onClick={commitBulk} disabled={bulkRows.every((r) => r.outcome === "rejected")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">
                Commit valid rows
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
