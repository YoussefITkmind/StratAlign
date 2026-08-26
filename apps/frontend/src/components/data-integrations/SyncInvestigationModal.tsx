"use client";

import { AlertTriangle, Info, Sparkles, X } from "lucide-react";

export interface SyncInvestigationResultView {
  syncLogId: string;
  integration: string;
  kind: "SYNC_FAILURE" | "VOLUME_DROP" | "NO_ANOMALY";
  source: "ai" | "deterministic";
  diagnosis: string;
  likelyCause: string | null;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  recommendedActions: string[];
  insufficientData: boolean;
  volume: {
    currentVolume: number;
    historicalAverage: number;
    changePercent: number;
    sampleCount: number;
    isAnomalousDrop: boolean;
  } | null;
}

const CONFIDENCE_META: Record<SyncInvestigationResultView["confidence"], { label: string; className: string }> = {
  low: { label: "Low confidence", className: "bg-amber-50 text-amber-700 border-amber-200" },
  medium: { label: "Medium confidence", className: "bg-blue-50 text-blue-700 border-blue-200" },
  high: { label: "High confidence", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

interface Props {
  integration: string;
  isLoading: boolean;
  error: string | null;
  result: SyncInvestigationResultView | null;
  onClose: () => void;
}

export default function SyncInvestigationModal({ integration, isLoading, error, result, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="AI sync investigation" onClick={(event) => event.stopPropagation()} className="max-h-[85vh] w-full max-w-lg animate-fade-in overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white"><Sparkles className="h-4 w-4" /></span>
            <div><p className="text-base font-semibold text-slate-900">Sync Investigation</p><p className="text-xs text-slate-400">{integration}</p></div>
          </div>
          <button onClick={onClose} aria-label="Close investigation" className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>

        {isLoading && (
          <div className="mt-6 flex flex-col items-center gap-3 py-8">
            <div role="status" aria-live="polite" className="h-8 w-8 animate-spin-slow rounded-full border-2 border-violet-200 border-t-violet-600"><span className="sr-only">Investigating…</span></div>
            <p className="text-sm text-slate-400">Reviewing sync logs and error patterns…</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div><p className="text-sm font-semibold text-red-800">Investigation failed</p><p className="mt-0.5 text-xs text-red-700">{error}</p></div>
          </div>
        )}

        {!isLoading && !error && result && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700"><Sparkles className="h-3 w-3" />{result.source === "ai" ? "AI-generated diagnosis" : "Evidence-based diagnosis"}</span>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_META[result.confidence].className}`}>{CONFIDENCE_META[result.confidence].label}</span>
            </div>

            {result.insufficientData && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div><p className="text-sm font-semibold text-amber-900">Not enough evidence for a reliable cause</p><p className="mt-0.5 text-xs text-amber-800">The available sync information cannot single out a cause, so none is offered rather than guessed.</p></div>
              </div>
            )}

            <Section title="Diagnosis"><p className="text-xs leading-relaxed text-slate-600">{result.diagnosis}</p></Section>
            {result.likelyCause && <Section title="Most likely cause"><p className="text-xs leading-relaxed text-slate-600">{result.likelyCause}</p></Section>}
            {result.volume && <Section title="Volume"><p className="text-xs leading-relaxed text-slate-600">{result.volume.currentVolume.toLocaleString()} records this run against an average of {result.volume.historicalAverage.toLocaleString()} over {result.volume.sampleCount} previous successful {result.volume.sampleCount === 1 ? "run" : "runs"} ({result.volume.changePercent > 0 ? "+" : ""}{result.volume.changePercent}%).</p></Section>}
            {result.evidence.length > 0 && <Section title="Evidence"><ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">{result.evidence.map((item) => <li key={item}>{item}</li>)}</ul></Section>}
            {result.recommendedActions.length > 0 && <Section title="Recommended next steps"><ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-slate-600">{result.recommendedActions.map((item) => <li key={item}>{item}</li>)}</ul></Section>}

            <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">This diagnosis is based only on the recorded sync data, not a guaranteed root cause or a fix. Nothing has been changed or retried — review the evidence and apply any step yourself.</p>
            <button onClick={onClose} className="w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800">Got it</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p><div className="mt-1">{children}</div></div>;
}
