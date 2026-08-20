"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Objective, PerspectiveKey } from "@/types/strategyMap";
import { PERSPECTIVE_ORDER, PERSPECTIVE_CONFIG } from "@/lib/mapConfig";

interface Props {
  onClose: () => void;
  onAdd: (objective: Objective) => void;
  nextColumn: (perspective: PerspectiveKey) => number;
}

export default function AddObjectiveModal({ onClose, onAdd, nextColumn }: Props) {
  const [title, setTitle] = useState("");
  const [perspective, setPerspective] = useState<PerspectiveKey>("financial");
  const [owner, setOwner] = useState("");
  const [score, setScore] = useState(50);

  const submit = () => {
    if (!title.trim() || !owner.trim()) return;
    onAdd({
      id: `obj-${Date.now()}`,
      title: title.trim(),
      perspective,
      owner: owner.trim(),
      score,
      column: nextColumn(perspective),
    });
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reduce Churn Rate"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Perspective</label>
            <div className="grid grid-cols-2 gap-2">
              {PERSPECTIVE_ORDER.map((key) => {
                const cfg = PERSPECTIVE_CONFIG[key];
                const on = perspective === key;
                return (
                  <button
                    key={key}
                    onClick={() => setPerspective(key)}
                    className="rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors"
                    style={{
                      borderColor: on ? cfg.accent : "#e5e7eb",
                      background: on ? cfg.bandBg : "white",
                      color: on ? cfg.textColor : "#374151",
                    }}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="e.g. Jamie Park"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Score ({score}%)</label>
              <input type="range" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="mt-2.5 w-full accent-indigo-600" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || !owner.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add Objective
          </button>
        </div>
      </div>
    </div>
  );
}
