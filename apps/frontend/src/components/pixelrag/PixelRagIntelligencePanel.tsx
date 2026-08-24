"use client";

import { useState } from "react";
import { BrainCircuit, Loader2, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc/client";

type IntelligenceKind =
  | "executive_summary"
  | "variance_explanation"
  | "explain_kpi"
  | "objective_health"
  | "initiative_impact"
  | "recommendations";

const actions: Array<{ kind: IntelligenceKind; label: string; description: string; needsSubject: boolean }> = [
  { kind: "executive_summary", label: "Executive summary", description: "Board-ready strategic health, movements, risks and decisions.", needsSubject: false },
  { kind: "variance_explanation", label: "Variance explanation", description: "Explain documented causes behind a performance variance.", needsSubject: true },
  { kind: "explain_kpi", label: "Explain KPI", description: "Target, actual, trend, causes, risks and related initiatives.", needsSubject: true },
  { kind: "objective_health", label: "Objective health", description: "Assess an objective through its KPI and initiative evidence.", needsSubject: true },
  { kind: "initiative_impact", label: "Initiative impact", description: "Compare delivery activity with measurable KPI outcomes.", needsSubject: true },
  { kind: "recommendations", label: "Recommendations", description: "Evidence-backed management actions separated from report facts.", needsSubject: true },
];

export default function PixelRagIntelligencePanel({ selectedDocumentName }: { selectedDocumentName: string | null }) {
  const [kind, setKind] = useState<IntelligenceKind>("executive_summary");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const intelligence = trpc.pixelrag.intelligence.useMutation();
  const selected = actions.find((action) => action.kind === kind)!;

  const run = async () => {
    if (selected.needsSubject && !subject.trim()) {
      setError("Enter the KPI, objective, initiative or subject you want to analyse.");
      return;
    }
    setError(null);
    try {
      await intelligence.mutateAsync({
        kind,
        ...(subject.trim() ? { subject: subject.trim() } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Intelligence request failed");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-50 p-2"><BrainCircuit className="h-5 w-5 text-indigo-600" /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Performance intelligence</h2>
            <p className="text-sm text-gray-500">Run grounded management analysis against the active source document.</p>
          </div>
        </div>

        {selectedDocumentName ? (
          <p className="mt-4 text-xs font-medium text-gray-500">Active source: {selectedDocumentName}</p>
        ) : (
          <p className="mt-4 text-sm text-amber-700">Select a ready document before running intelligence.</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {actions.map((action) => (
            <button
              key={action.kind}
              type="button"
              onClick={() => { setKind(action.kind); setError(null); intelligence.reset(); }}
              className={`rounded-xl border p-4 text-left transition ${kind === action.kind ? "border-indigo-500 bg-indigo-50" : "border-gray-200 hover:bg-gray-50"}`}
            >
              <p className={`text-sm font-semibold ${kind === action.kind ? "text-indigo-900" : "text-gray-900"}`}>{action.label}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{action.description}</p>
            </button>
          ))}
        </div>

        {selected.needsSubject && (
          <div className="mt-5">
            <label htmlFor="pixelrag-intelligence-subject" className="mb-1.5 block text-sm font-medium text-gray-700">Subject</label>
            <input
              id="pixelrag-intelligence-subject"
              value={subject}
              onChange={(event) => { setSubject(event.target.value); setError(null); }}
              maxLength={500}
              placeholder={kind === "explain_kpi" ? "e.g. Customer Satisfaction" : "Enter the subject to analyse"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => void run()}
          disabled={!selectedDocumentName || intelligence.isPending}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {intelligence.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {intelligence.isPending ? "Analysing…" : `Run ${selected.label}`}
        </button>

        {(error || intelligence.error) && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error ?? intelligence.error?.message}</div>
        )}
      </section>

      {intelligence.data && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-gray-900">{selected.label}</h2>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">Grounded in {selectedDocumentName}</span>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-700">{intelligence.data.answer}</p>
          {intelligence.data.evidence.length > 0 && (
            <div className="mt-5 border-t border-gray-100 pt-4">
              <h3 className="text-sm font-semibold text-gray-900">Evidence used</h3>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {intelligence.data.evidence.map((item, index) => (
                  <li key={`${index}-${item}`} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
