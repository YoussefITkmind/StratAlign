"use client";

import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Kpi } from "@/types/kpi";
import { mockStrategyNodes } from "@/data/mockStrategyNodes";
import { useKpiStore } from "@/components/providers/KpiStoreProvider";

export default function AlignmentTab({ kpi }: { kpi: Kpi }) {
  const { updateKpi, addVersionEntry } = useKpiStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  const aligned = mockStrategyNodes.filter((n) => kpi.alignedNodeIds.includes(n.id));

  const toggleNode = (nodeId: string) => {
    const next = kpi.alignedNodeIds.includes(nodeId)
      ? kpi.alignedNodeIds.filter((id) => id !== nodeId)
      : [...kpi.alignedNodeIds, nodeId];
    updateKpi(kpi.id, { alignedNodeIds: next });
  };

  const closePicker = () => {
    setPickerOpen(false);
    addVersionEntry(kpi.id, { editedBy: kpi.owner.name, editedAt: new Date().toISOString(), changeType: "alignment", summary: "Strategy alignment updated." });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Aligned Strategy Nodes</h2>
        <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <Link2 className="h-3.5 w-3.5" /> Edit Alignment
        </button>
      </div>

      {aligned.length === 0 ? (
        <p className="text-sm text-gray-400">This KPI isn&apos;t aligned to any strategy node yet.</p>
      ) : (
        <div className="space-y-2">
          {aligned.map((node) => (
            <div key={node.id} className="flex items-center gap-2.5 rounded-lg border border-gray-100 px-3 py-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${node.type === "pillar" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"}`}>
                {node.type === "pillar" ? "Pillar" : "Objective"}
              </span>
              <span className="text-sm text-gray-800">{node.name}</span>
            </div>
          ))}
        </div>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Align to Strategy</h3>
              <button onClick={closePicker} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              {mockStrategyNodes.map((node) => (
                <label
                  key={node.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 ${node.type === "objective" ? "ml-4" : ""}`}
                >
                  <input type="checkbox" checked={kpi.alignedNodeIds.includes(node.id)} onChange={() => toggleNode(node.id)} className="h-3.5 w-3.5 rounded border-gray-300" />
                  <span className={node.type === "pillar" ? "font-semibold text-gray-900" : "text-gray-700"}>{node.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={closePicker} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
