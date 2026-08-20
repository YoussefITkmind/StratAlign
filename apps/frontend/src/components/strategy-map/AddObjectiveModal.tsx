"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface EligibleObjective {
  id: string;
  nameEn: string;
}

interface PerspectiveOption {
  id: string;
  nameEn: string;
}

interface Props {
  objectives: EligibleObjective[];
  perspectives: PerspectiveOption[];
  busy?: boolean;
  onClose: () => void;
  onAdd: (objectiveNodeId: string, perspectiveId: string) => void | Promise<void>;
}

export default function AddObjectiveModal({ objectives, perspectives, busy, onClose, onAdd }: Props) {
  const [objectiveNodeId, setObjectiveNodeId] = useState("");
  const [perspectiveId, setPerspectiveId] = useState(perspectives[0]?.id ?? "");

  const canSubmit = Boolean(objectiveNodeId) && Boolean(perspectiveId) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onAdd(objectiveNodeId, perspectiveId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Add Objective</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Objective</label>
            {objectives.length === 0 ? (
              <p className="text-sm text-gray-400">No eligible objectives left to place on this map.</p>
            ) : (
              <select
                value={objectiveNodeId}
                onChange={(e) => setObjectiveNodeId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="" disabled>Select an objective…</option>
                {objectives.map((objective) => (
                  <option key={objective.id} value={objective.id}>{objective.nameEn}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Perspective</label>
            <select
              value={perspectiveId}
              onChange={(e) => setPerspectiveId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              {perspectives.map((perspective) => (
                <option key={perspective.id} value={perspective.id}>{perspective.nameEn}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Objective
          </button>
        </div>
      </div>
    </div>
  );
}
