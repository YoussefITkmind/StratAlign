"use client";

import { useState } from "react";

type Choice = { id: string; nameEn: string };

export default function ObjectivePlacementControls({
  objectives,
  perspectives,
  busy,
  onAdd,
}: {
  objectives: Choice[];
  perspectives: Choice[];
  busy: boolean;
  onAdd: (objectiveNodeId: string, perspectiveId: string) => Promise<void>;
}) {
  const [objectiveId, setObjectiveId] = useState("");
  const [perspectiveId, setPerspectiveId] = useState("");

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Add existing objective</h2>
      <div className="space-y-2">
        <select data-testid="existing-objective-select" value={objectiveId} onChange={(event) => setObjectiveId(event.target.value)} className="w-full rounded-lg border p-2 text-sm">
          <option value="">Choose an eligible objective…</option>
          {objectives.map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}
        </select>
        <select data-testid="objective-perspective-select" value={perspectiveId} onChange={(event) => setPerspectiveId(event.target.value)} className="w-full rounded-lg border p-2 text-sm">
          <option value="">Choose a perspective…</option>
          {perspectives.map((item) => <option key={item.id} value={item.id}>{item.nameEn}</option>)}
        </select>
        <button
          type="button"
          data-testid="add-existing-objective"
          disabled={busy || !objectiveId || !perspectiveId}
          onClick={() => void onAdd(objectiveId, perspectiveId).then(() => setObjectiveId(""))}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Add objective
        </button>
        {objectives.length === 0 && <p className="text-xs text-gray-400">All eligible objectives are already placed.</p>}
      </div>
    </section>
  );
}
