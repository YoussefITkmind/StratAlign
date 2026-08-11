"use client";

import { useState } from "react";
import { X, Archive, AlertTriangle } from "lucide-react";
import { Kpi } from "@/types/kpi";
import { mockStrategyNodes } from "@/data/mockStrategyNodes";

export default function RetireModal({ kpi, dependents, onClose, onConfirm }: { kpi: Kpi; dependents: Kpi[]; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  const alignedNodes = mockStrategyNodes.filter((n) => kpi.alignedNodeIds.includes(n.id));
  const hasImpact = alignedNodes.length > 0 || dependents.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Archive className="h-5 w-5 text-red-500" /> Retire KPI
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600">
          Retiring <span className="font-medium text-gray-900">{kpi.name}</span> stops it from accepting new measurements and removes it from active dashboards. It stays visible in the catalogue (marked retired) and its history is preserved.
        </p>

        {hasImpact ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" /> Impact preview
            </p>
            {alignedNodes.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-amber-700">Aligned strategy nodes ({alignedNodes.length})</p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                  {alignedNodes.map((n) => <li key={n.id}>· {n.name}</li>)}
                </ul>
              </div>
            )}
            {dependents.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-amber-700">Roll-up KPIs that depend on this ({dependents.length})</p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                  {dependents.map((d) => <li key={d.id}>· {d.name}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">No aligned strategy nodes or dependent roll-ups — retiring this KPI has no downstream impact.</p>
        )}

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">Reason (optional)</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why is this KPI being retired?"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(note)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Retire KPI</button>
        </div>
      </div>
    </div>
  );
}
