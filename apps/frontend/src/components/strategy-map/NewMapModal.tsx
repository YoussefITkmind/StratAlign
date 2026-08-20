"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface Props {
  busy?: boolean;
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
}

export default function NewMapModal({ busy, onClose, onCreate }: Props) {
  const [name, setName] = useState("");

  const canSubmit = Boolean(name.trim()) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    await onCreate(name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">New Strategy Map</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Map name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. EMEA Expansion Strategy"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
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
            Create Map
          </button>
        </div>
      </div>
    </div>
  );
}
