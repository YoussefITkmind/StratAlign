"use client";

import { useState } from "react";
import { DatabaseZap, FileCheck2, Loader2, RefreshCw, ShieldCheck, WandSparkles } from "lucide-react";

import { trpc } from "@/lib/trpc/client";

function confidence(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export default function PixelRagExtractionPanel({
  selectedDocumentId,
  selectedDocumentName,
}: {
  selectedDocumentId: string | null;
  selectedDocumentName: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const reanalyze = trpc.pixelrag.reanalyzeDocument.useMutation();
  const smartImport = trpc.pixelrag.previewSmartImport.useMutation();
  const dataCapture = trpc.pixelrag.previewDataCapture.useMutation();

  const runReanalysis = async () => {
    if (!selectedDocumentId) return;
    setError(null);
    try {
      await reanalyze.mutateAsync({ documentId: selectedDocumentId });
      smartImport.reset();
      dataCapture.reset();
      await Promise.all([
        utils.pixelrag.audit.invalidate(),
        utils.pixelrag.workflows.invalidate(),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document analysis failed");
    }
  };

  const runSmartImport = async () => {
    setError(null);
    try {
      await smartImport.mutateAsync();
      await Promise.all([utils.pixelrag.audit.invalidate(), utils.pixelrag.workflows.invalidate()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Smart Import preview failed");
    }
  };

  const runDataCapture = async () => {
    setError(null);
    try {
      await dataCapture.mutateAsync();
      await Promise.all([utils.pixelrag.audit.invalidate(), utils.pixelrag.workflows.invalidate()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Data Capture preview failed");
    }
  };

  const extraction = reanalyze.data?.extraction;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-50 p-2"><DatabaseZap className="h-5 w-5 text-cyan-700" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Structured strategy extraction</h2>
              <p className="text-sm text-gray-500">Objectives, KPIs, initiatives and reporting context extracted from visual evidence.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void runReanalysis()}
            disabled={!selectedDocumentId || reanalyze.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reanalyze.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {reanalyze.isPending ? "Extracting…" : "Reanalyse document"}
          </button>
        </div>

        {!selectedDocumentId && <p className="mt-5 text-sm text-gray-500">Select a ready document before running extraction.</p>}
        {selectedDocumentName && <p className="mt-4 text-xs font-medium text-gray-500">Active source: {selectedDocumentName}</p>}
        {error && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      </section>

      {extraction && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Extracted strategy</h2>
              <p className="mt-1 text-xs text-gray-500">
                {extraction.reporting_period ? `Reporting period: ${extraction.reporting_period}` : "Reporting period not explicitly identified"}
                {" · "}{extraction.extraction_version}
              </p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Fresh analysis</span>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <ExtractionGroup title="Objectives" count={extraction.objectives.length}>
              {extraction.objectives.map((item, index) => (
                <ExtractionItem key={`${item.name}-${index}`} title={item.name ?? "Unnamed objective"} confidence={confidence(item.confidence)}>
                  <Meta label="Owner" value={item.owner} />
                  <Meta label="Status" value={item.status} />
                </ExtractionItem>
              ))}
            </ExtractionGroup>

            <ExtractionGroup title="KPIs" count={extraction.kpis.length}>
              {extraction.kpis.map((item, index) => (
                <ExtractionItem key={`${item.name}-${index}`} title={item.name ?? "Unnamed KPI"} confidence={confidence(item.confidence)}>
                  <Meta label="Target" value={item.target} />
                  <Meta label="Actual" value={item.actual} />
                  <Meta label="Period" value={item.period} />
                  <Meta label="Status" value={item.status} />
                </ExtractionItem>
              ))}
            </ExtractionGroup>

            <ExtractionGroup title="Initiatives" count={extraction.initiatives.length}>
              {extraction.initiatives.map((item, index) => (
                <ExtractionItem key={`${item.name}-${index}`} title={item.name ?? "Unnamed initiative"} confidence={confidence(item.confidence)}>
                  <Meta label="Owner" value={item.owner} />
                  <Meta label="Status" value={item.status} />
                  <Meta label="Planned completion" value={item.planned_completion} />
                </ExtractionItem>
              ))}
            </ExtractionGroup>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <ProposalCard
          icon={<WandSparkles className="h-5 w-5 text-violet-600" />}
          title="Smart Import preview"
          description="Stage extracted objectives, KPIs and initiatives as a reviewable proposal. Nothing is applied to StratAlign."
          button="Generate Smart Import preview"
          loading={smartImport.isPending}
          disabled={!selectedDocumentId}
          onClick={() => void runSmartImport()}
        >
          {smartImport.data && (
            <div className="space-y-2 text-sm text-gray-700">
              <SummaryRow label="Objectives" value={smartImport.data.objectives.length} />
              <SummaryRow label="KPIs" value={smartImport.data.kpis.length} />
              <SummaryRow label="Initiatives" value={smartImport.data.initiatives.length} />
              <SummaryRow label="Status" value={smartImport.data.status.replaceAll("_", " ")} />
              {smartImport.data.job_id && <p className="pt-2 text-xs text-gray-400">Workflow {smartImport.data.job_id}</p>}
            </div>
          )}
        </ProposalCard>

        <ProposalCard
          icon={<FileCheck2 className="h-5 w-5 text-amber-600" />}
          title="Data Capture preview"
          description="Match extracted measurements to known KPI records inside the isolated POC dataset and show proposed updates only."
          button="Generate Data Capture preview"
          loading={dataCapture.isPending}
          disabled={!selectedDocumentId}
          onClick={() => void runDataCapture()}
        >
          {dataCapture.data && (
            <div className="space-y-2">
              <SummaryRow label="Proposed KPI updates" value={dataCapture.data.updates.length} />
              <SummaryRow label="Matched" value={dataCapture.data.updates.filter((item) => item.match_status === "matched").length} />
              <SummaryRow label="Needs review" value={dataCapture.data.updates.filter((item) => item.match_status !== "matched").length} />
              {dataCapture.data.updates.slice(0, 5).map((item, index) => (
                <div key={`${item.extracted_kpi}-${index}`} className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  <p className="font-medium text-gray-800">{item.extracted_kpi ?? "Unidentified KPI"}</p>
                  <p className="mt-1">{item.current_actual ?? "—"} → {item.proposed_actual ?? "—"} · {item.match_status.replaceAll("_", " ")}</p>
                </div>
              ))}
            </div>
          )}
        </ProposalCard>
      </section>

      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Human-review boundary enforced</p>
          <p className="mt-1 text-sm leading-6 text-emerald-800">This StratAlign integration exposes Smart Import and Data Capture as previews only. There is no apply procedure in the TypeScript API and no direct Prisma write path from PixelRAG.</p>
        </div>
      </div>
    </div>
  );
}

function ExtractionGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900">{title}</h3><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{count}</span></div>
      <div className="space-y-2">{count === 0 ? <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">None extracted.</p> : children}</div>
    </div>
  );
}

function ExtractionItem({ title, confidence: score, children }: { title: string; confidence: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-gray-900">{title}</p><span className="shrink-0 text-[11px] text-gray-400">{score}</span></div>
      <dl className="mt-2 space-y-1 text-xs">{children}</dl>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return <div className="flex justify-between gap-3"><dt className="text-gray-400">{label}</dt><dd className="text-right text-gray-600">{value || "—"}</dd></div>;
}

function ProposalCard({ icon, title, description, button, loading, disabled, onClick, children }: { icon: React.ReactNode; title: string; description: string; button: string; loading: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3"><div className="rounded-lg bg-gray-50 p-2">{icon}</div><div><h2 className="font-semibold text-gray-900">{title}</h2><p className="mt-0.5 text-sm text-gray-500">{description}</p></div></div>
      <button type="button" onClick={onClick} disabled={disabled || loading} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Working…" : button}
      </button>
      {children && <div className="mt-4 border-t border-gray-100 pt-4">{children}</div>}
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><span className="text-gray-500">{label}</span><span className="font-medium capitalize text-gray-900">{value}</span></div>;
}
