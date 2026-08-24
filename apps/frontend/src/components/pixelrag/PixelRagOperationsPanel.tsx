"use client";

import { useEffect, useState } from "react";
import { Activity, Cable, FolderSync, Loader2, Save, ShieldCheck, Workflow } from "lucide-react";

import { trpc } from "@/lib/trpc/client";

type GovernanceForm = {
  require_human_approval: boolean;
  minimum_extraction_confidence: number;
  minimum_match_confidence: number;
  allow_automatic_writes: boolean;
  retain_evidence: boolean;
  retain_audit_history: boolean;
  allowed_apply_roles: string[];
  max_multi_document_sources: number;
};

type IngestionForm = {
  enabled: boolean;
  poll_seconds: number;
  watched_folder: string;
};

export default function PixelRagOperationsPanel() {
  const utils = trpc.useUtils();
  const governance = trpc.pixelrag.governance.useQuery();
  const ingestion = trpc.pixelrag.ingestionSettings.useQuery();
  const connectors = trpc.pixelrag.connectors.useQuery();
  const audit = trpc.pixelrag.audit.useQuery({ limit: 50 });
  const workflows = trpc.pixelrag.workflows.useQuery({ limit: 50 });

  const updateGovernance = trpc.pixelrag.updateGovernance.useMutation();
  const updateIngestion = trpc.pixelrag.updateIngestionSettings.useMutation();
  const scan = trpc.pixelrag.scanIngestion.useMutation();

  const [governanceForm, setGovernanceForm] = useState<GovernanceForm | null>(null);
  const [ingestionForm, setIngestionForm] = useState<IngestionForm | null>(null);

  useEffect(() => {
    // Mirror query data into the editable local form without changing the underlying policy shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (governance.data) setGovernanceForm({ ...governance.data, allow_automatic_writes: false });
  }, [governance.data]);

  useEffect(() => {
    // Mirror query data into the editable local form without changing ingestion settings semantics.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ingestion.data) setIngestionForm(ingestion.data);
  }, [ingestion.data]);

  const saveGovernance = async () => {
    if (!governanceForm) return;
    try {
      await updateGovernance.mutateAsync({ ...governanceForm, allow_automatic_writes: false });
      await Promise.all([utils.pixelrag.governance.invalidate(), utils.pixelrag.audit.invalidate()]);
    } catch {
      // Mutation error rendered below.
    }
  };

  const saveIngestion = async () => {
    if (!ingestionForm) return;
    try {
      await updateIngestion.mutateAsync(ingestionForm);
      await utils.pixelrag.ingestionSettings.invalidate();
    } catch {
      // Mutation error rendered below.
    }
  };

  const runScan = async () => {
    try {
      await scan.mutateAsync();
      await Promise.all([
        utils.pixelrag.documents.invalidate(),
        utils.pixelrag.audit.invalidate(),
        utils.pixelrag.workflows.invalidate(),
      ]);
    } catch {
      // Mutation error rendered below.
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /></div>
            <div><h2 className="font-semibold text-gray-900">PixelRAG governance</h2><p className="text-sm text-gray-500">Review thresholds and evidence-retention policy.</p></div>
          </div>

          {governance.isLoading || !governanceForm ? (
            <p className="mt-5 text-sm text-gray-500">Loading governance settings…</p>
          ) : (
            <div className="mt-5 space-y-4">
              <Toggle label="Require human approval" checked={governanceForm.require_human_approval} onChange={(value) => setGovernanceForm({ ...governanceForm, require_human_approval: value })} />
              <Toggle label="Retain evidence" checked={governanceForm.retain_evidence} onChange={(value) => setGovernanceForm({ ...governanceForm, retain_evidence: value })} />
              <Toggle label="Retain audit history" checked={governanceForm.retain_audit_history} onChange={(value) => setGovernanceForm({ ...governanceForm, retain_audit_history: value })} />
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField label="Extraction confidence" value={governanceForm.minimum_extraction_confidence} min={0} max={1} step={0.01} onChange={(value) => setGovernanceForm({ ...governanceForm, minimum_extraction_confidence: value })} />
                <NumberField label="KPI match confidence" value={governanceForm.minimum_match_confidence} min={0} max={1} step={0.01} onChange={(value) => setGovernanceForm({ ...governanceForm, minimum_match_confidence: value })} />
                <NumberField label="Max compare sources" value={governanceForm.max_multi_document_sources} min={1} max={10} step={1} onChange={(value) => setGovernanceForm({ ...governanceForm, max_multi_document_sources: value })} />
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">
                Automatic writes are disabled by the StratAlign integration. Smart Import and Data Capture remain preview-only regardless of this POC policy record.
              </div>
              <button type="button" onClick={() => void saveGovernance()} disabled={updateGovernance.isPending} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                {updateGovernance.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save policy
              </button>
              {updateGovernance.error && <p role="alert" className="text-sm text-red-600">{updateGovernance.error.message}</p>}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2"><FolderSync className="h-5 w-5 text-blue-700" /></div>
            <div><h2 className="font-semibold text-gray-900">Watched-folder ingestion</h2><p className="text-sm text-gray-500">Schedule or manually scan the PixelRAG ingestion drop.</p></div>
          </div>

          {ingestion.isLoading || !ingestionForm ? (
            <p className="mt-5 text-sm text-gray-500">Loading ingestion settings…</p>
          ) : (
            <div className="mt-5 space-y-4">
              <Toggle label="Scheduled ingestion" checked={ingestionForm.enabled} onChange={(value) => setIngestionForm({ ...ingestionForm, enabled: value })} />
              <label className="block text-xs font-medium text-gray-600">Watched folder
                <input value={ingestionForm.watched_folder} onChange={(event) => setIngestionForm({ ...ingestionForm, watched_folder: event.target.value })} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <NumberField label="Poll interval (seconds)" value={ingestionForm.poll_seconds} min={60} max={86400} step={60} onChange={(value) => setIngestionForm({ ...ingestionForm, poll_seconds: value })} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void saveIngestion()} disabled={updateIngestion.isPending} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Save className="h-4 w-4" /> Save settings</button>
                <button type="button" onClick={() => void runScan()} disabled={scan.isPending} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSync className="h-4 w-4" />} Scan now</button>
              </div>
              {(updateIngestion.error || scan.error) && <p role="alert" className="text-sm text-red-600">{updateIngestion.error?.message ?? scan.error?.message}</p>}
              {scan.data && (
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                  {scan.data.results.length === 0 ? "No new files found." : scan.data.results.map((item, index) => <p key={`${item.name}-${index}`}>{item.name ?? "Scan"}: {item.status}{item.reason ? ` · ${item.reason}` : ""}{item.error ? ` · ${item.error}` : ""}</p>)}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3"><Cable className="h-5 w-5 text-gray-500" /><div><h2 className="font-semibold text-gray-900">Connector readiness</h2><p className="text-sm text-gray-500">Available ingestion adapters and configuration status.</p></div></div>
        {connectors.data && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...connectors.data.active, ...connectors.data.adapter_ready].map((connector) => (
              <article key={connector.id} className="rounded-lg border border-gray-200 p-3"><p className="text-sm font-medium text-gray-900">{connector.name}</p><p className="mt-1 text-xs capitalize text-gray-500">{connector.status.replaceAll("_", " ")}</p></article>
            ))}
          </div>
        )}
        {connectors.data?.note && <p className="mt-3 text-xs text-gray-400">{connectors.data.note}</p>}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4"><Activity className="h-5 w-5 text-gray-500" /><div><h2 className="font-semibold text-gray-900">PixelRAG audit</h2><p className="text-sm text-gray-500">Recent feature-local operations.</p></div></div>
          <div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
            {!audit.data?.length ? <p className="p-5 text-sm text-gray-500">No PixelRAG audit events yet.</p> : audit.data.map((event) => (
              <article key={event.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-900">{event.action.replaceAll("_", " ")}</p><time className="text-[11px] text-gray-400">{new Date(event.at).toLocaleString()}</time></div><p className="mt-1 text-xs text-gray-500">{event.resource}{event.resource_id ? ` · ${event.resource_id}` : ""} · {event.actor}</p></article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4"><Workflow className="h-5 w-5 text-gray-500" /><div><h2 className="font-semibold text-gray-900">Proposal workflows</h2><p className="text-sm text-gray-500">Smart Import and Data Capture preview history.</p></div></div>
          <div className="max-h-[420px] divide-y divide-gray-100 overflow-y-auto">
            {!workflows.data?.length ? <p className="p-5 text-sm text-gray-500">No proposal workflows yet.</p> : workflows.data.map((job) => (
              <article key={job.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-gray-900">{job.kind.replaceAll("_", " ")}</p><span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium capitalize text-amber-700">{job.status.replaceAll("_", " ")}</span></div><p className="mt-1 truncate text-xs text-gray-500">{job.document_name} · {job.id}</p></article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" /></label>;
}

function NumberField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="block text-xs font-medium text-gray-600">{label}<input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>;
}
