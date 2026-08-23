"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  BrainCircuit,
  DatabaseZap,
  FileText,
  Gauge,
  MessageSquareText,
  RefreshCw,
  Server,
  Settings2,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import PixelRagAskPanel from "./PixelRagAskPanel";
import PixelRagDocumentsPanel from "./PixelRagDocumentsPanel";
import PixelRagExtractionPanel from "./PixelRagExtractionPanel";
import PixelRagIntelligencePanel from "./PixelRagIntelligencePanel";
import PixelRagOperationsPanel from "./PixelRagOperationsPanel";
import PixelRagPerformancePanel from "./PixelRagPerformancePanel";

type TabKey = "documents" | "ask" | "extraction" | "intelligence" | "performance" | "operations";

const tabs: Array<{ key: TabKey; label: string; icon: ComponentType<{ className?: string }> }> = [
  { key: "documents", label: "Documents", icon: FileText },
  { key: "ask", label: "Ask & Compare", icon: MessageSquareText },
  { key: "extraction", label: "Extract & Propose", icon: DatabaseZap },
  { key: "intelligence", label: "Intelligence", icon: BrainCircuit },
  { key: "performance", label: "Performance", icon: Gauge },
  { key: "operations", label: "Operations", icon: Settings2 },
];

export default function PixelRagWorkspace() {
  const [tab, setTab] = useState<TabKey>("documents");
  const health = trpc.pixelrag.health.useQuery(undefined, { retry: 1 });
  const documents = trpc.pixelrag.documents.useQuery(undefined, { retry: 1 });
  const utils = trpc.useUtils();

  const library = documents.data?.documents ?? [];
  const selectedDocumentId = documents.data?.selected_document_id ?? null;
  const selectedDocument = library.find((document) => document.id === selectedDocumentId) ?? null;
  const readyCount = library.filter((document) => document.status === "ready").length;

  const refresh = async () => {
    await Promise.all([
      health.refetch(),
      documents.refetch(),
      utils.pixelrag.alerts.invalidate(),
      utils.pixelrag.audit.invalidate(),
      utils.pixelrag.workflows.invalidate(),
    ]);
  };

  return (
    <div className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-blue-50 p-2"><BrainCircuit className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h1 className="text-[22px] font-bold text-gray-900">AI Intelligence</h1>
              <p className="mt-0.5 text-sm text-gray-500">PixelRAG document & performance intelligence</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            icon={Server}
            label={health.isSuccess ? "PixelRAG connected" : health.isLoading ? "Checking PixelRAG" : "PixelRAG unavailable"}
            state={health.isSuccess ? "success" : health.isLoading ? "neutral" : "error"}
          />
          <StatusPill icon={FileText} label={`${readyCount} ready document${readyCount === 1 ? "" : "s"}`} state="neutral" />
          {selectedDocument && <StatusPill icon={Activity} label={`Active: ${selectedDocument.name}`} state="active" />}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={health.isFetching || documents.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${health.isFetching || documents.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {health.isError && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">PixelRAG document intelligence is unavailable</p>
          <p className="mt-1 text-sm text-amber-800">{health.error.message}. The rest of StratAlign remains unaffected.</p>
        </div>
      )}

      <div className="mb-5 flex items-center gap-4 overflow-x-auto border-b border-gray-200 sm:gap-6">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              data-testid={`pixelrag-tab-${item.key}`}
              className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition ${
                active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </div>

      {documents.isLoading && tab !== "operations" ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Loading PixelRAG workspace…</div>
      ) : documents.isError && tab !== "operations" ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{documents.error.message}</div>
      ) : (
        <>
          {tab === "documents" && <PixelRagDocumentsPanel documents={library} selectedDocumentId={selectedDocumentId} />}
          {tab === "ask" && <PixelRagAskPanel documents={library} selectedDocumentId={selectedDocumentId} />}
          {tab === "extraction" && <PixelRagExtractionPanel selectedDocumentId={selectedDocumentId} selectedDocumentName={selectedDocument?.name ?? null} />}
          {tab === "intelligence" && <PixelRagIntelligencePanel selectedDocumentName={selectedDocument?.name ?? null} />}
          {tab === "performance" && <PixelRagPerformancePanel />}
          {tab === "operations" && <PixelRagOperationsPanel />}
        </>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500">
        PixelRAG is isolated from StratAlign persistence. Smart Import and Data Capture are reviewable proposals only; no AI apply endpoint or direct StratAlign database write is exposed by this workspace.
      </div>
    </div>
  );
}

function StatusPill({
  icon: Icon,
  label,
  state,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  state: "success" | "error" | "neutral" | "active";
}) {
  const classes = state === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : state === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : state === "active"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-white text-gray-600";
  return <span className={`inline-flex max-w-xs items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${classes}`}><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></span>;
}
