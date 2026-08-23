"use client";

import { useEffect, useRef } from "react";
import {
  Bot, X, Loader2, AlertTriangle, RefreshCw, HelpCircle,
  ListChecks, FileSearch, ShieldAlert,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { message, STATUS_BADGE_CLASS, STATUS_LABEL } from "./sync-log-status";

/**
 * Dedicated AI investigation experience for one sync run.
 *
 * Deliberately not `AiSuggestModal`: that component reviews and accepts
 * generated registry content, a completely different workflow from
 * explaining a past event. This panel only ever reads and displays — it
 * creates nothing, so it has no accept/reject affordances at all.
 *
 * Rendered as a non-blocking side panel (no full-screen backdrop) so the
 * Sync Logs table underneath stays usable while an investigation runs.
 */
export default function InvestigationPanel({
  syncRunId,
  onClose,
}: {
  syncRunId: string;
  onClose: () => void;
}) {
  const run = trpc.syncLog.get.useQuery({ syncRunId });
  const investigation = trpc.syncLog.investigate.useMutation();

  const hasRun = useRef(false);
  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    investigation.mutate({ syncRunId });
    // Fires once per mount (i.e. once per opened sync run) — investigate is a
    // mutation, so nothing here should auto-retry on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncRunId]);

  const retry = () => investigation.mutate({ syncRunId });

  return (
    <div
      data-testid="investigation-panel"
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-indigo-50/60 p-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <Bot className="h-5 w-5 text-indigo-600" /> AI Sync Investigation
          </h2>
          <p className="mt-1 truncate text-xs text-slate-500">
            {run.data ? `${run.data.sourceName} · ${run.data.sourceKey}` : "Loading sync run…"}
          </p>
        </div>
        <button
          type="button"
          data-testid="close-panel"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="app-scroll flex-1 space-y-4 overflow-y-auto p-5">
        {run.data && (
          <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600">
            <div className="flex items-center justify-between">
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE_CLASS[run.data.status]}`}
              >
                {STATUS_LABEL[run.data.status]}
              </span>
              <span>{new Date(run.data.startedAt).toLocaleString()}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              <dt className="text-slate-400">Processed</dt>
              <dd>{run.data.recordsProcessed ?? "—"}</dd>
              <dt className="text-slate-400">Created / Updated</dt>
              <dd>{run.data.recordsCreated ?? "—"} / {run.data.recordsUpdated ?? "—"}</dd>
              <dt className="text-slate-400">Failed</dt>
              <dd>{run.data.recordsFailed ?? "—"}</dd>
              {run.data.errorCode && (
                <>
                  <dt className="text-slate-400">Error</dt>
                  <dd className="truncate" title={run.data.errorMessage ?? undefined}>
                    {run.data.errorCode}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}

        {investigation.isPending && (
          <p
            data-testid="investigation-loading"
            className="flex items-center justify-center gap-2 p-10 text-sm text-slate-400"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Investigating this sync run…
          </p>
        )}

        {investigation.isError && (
          <div
            data-testid="investigation-error"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4" /> Investigation failed
            </p>
            <p className="mt-1">{message(investigation.error)}</p>
            <button
              type="button"
              data-testid="retry-investigation"
              onClick={retry}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {investigation.data && (
          <div data-testid="investigation-result" className="space-y-4">
            {investigation.data.insufficientData && (
              <div
                data-testid="insufficient-data-badge"
                className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
              >
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  The AI could not determine a likely cause from the available sync data.
                </span>
              </div>
            )}

            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FileSearch className="h-3.5 w-3.5" /> Diagnosis
              </h3>
              <p data-testid="diagnosis" className="mt-1.5 text-sm leading-relaxed text-slate-800">
                {investigation.data.diagnosis}
              </p>
              {investigation.data.likelyCause && (
                <p className="mt-1.5 text-xs text-slate-500">
                  Likely cause: <span className="font-medium text-slate-700">{investigation.data.likelyCause}</span>
                </p>
              )}
              <p className="mt-1.5 text-xs text-slate-400">
                AI confidence: {Math.round(investigation.data.confidence * 100)}%
              </p>
            </div>

            {investigation.data.evidence.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ShieldAlert className="h-3.5 w-3.5" /> Evidence
                </h3>
                <ul data-testid="evidence-list" className="mt-1.5 space-y-1">
                  {investigation.data.evidence.map((item, index) => (
                    <li key={`evidence-${index}`} className="text-xs text-slate-600">
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {investigation.data.recommendedNextSteps.length > 0 && (
              <div>
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ListChecks className="h-3.5 w-3.5" /> Recommended next steps
                </h3>
                <ul data-testid="recommended-steps" className="mt-1.5 space-y-1.5">
                  {investigation.data.recommendedNextSteps.map((step, index) => (
                    <li
                      key={`step-${index}`}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700"
                    >
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="button"
              data-testid="retry-investigation"
              onClick={retry}
              disabled={investigation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-investigate
            </button>
          </div>
        )}
      </div>

      <p
        data-testid="ai-disclaimer"
        className="border-t border-slate-100 px-5 py-2.5 text-[11px] leading-relaxed text-slate-400"
      >
        <span className="font-medium text-slate-500">AI-generated diagnosis.</span>{" "}
        This is based on the available sync logs and data and is not a guaranteed fix.
      </p>
    </div>
  );
}
