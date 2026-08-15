"use client";

import { useState } from "react";

type Placement = { objectiveNodeId: string; objectiveNameEn: string };

export default function LinkEditControls({ placements, busy, onAdd }: {
  placements: Placement[];
  busy: boolean;
  onAdd: (sourceId: string, targetId: string, strength: "weak" | "strong") => Promise<void>;
}) {
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [strength, setStrength] = useState<"weak" | "strong">("strong");
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Draw link</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <select data-testid="link-source-select" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="rounded-lg border p-2 text-sm">
          <option value="">Source objective…</option>
          {placements.map((item) => <option key={item.objectiveNodeId} value={item.objectiveNodeId}>{item.objectiveNameEn}</option>)}
        </select>
        <select data-testid="link-target-select" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="rounded-lg border p-2 text-sm">
          <option value="">Target objective…</option>
          {placements.map((item) => <option key={item.objectiveNodeId} value={item.objectiveNodeId}>{item.objectiveNameEn}</option>)}
        </select>
        <select data-testid="link-strength-select" value={strength} onChange={(e) => setStrength(e.target.value as "weak" | "strong")} className="rounded-lg border p-2 text-sm">
          <option value="weak">Weak</option><option value="strong">Strong</option>
        </select>
        <button
          type="button"
          data-testid="confirm-link-button"
          disabled={busy || !sourceId || !targetId || sourceId === targetId}
          onClick={() => void onAdd(sourceId, targetId, strength).then(() => { setSourceId(""); setTargetId(""); })}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
        >Add link</button>
      </div>
    </section>
  );
}
