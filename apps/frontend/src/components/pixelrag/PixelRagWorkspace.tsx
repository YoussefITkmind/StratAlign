"use client";

import {
  BrainCircuit,
  FileText,
  RefreshCw,
  Server,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import PixelRagComparePanel from "@/components/pixelrag/PixelRagComparePanel";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;

  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function PixelRagWorkspace() {
  const health = trpc.pixelrag.health.useQuery();
  const documents = trpc.pixelrag.documents.useQuery();

  const refresh = async () => {
    await Promise.all([
      health.refetch(),
      documents.refetch(),
    ]);
  };

  const serviceAvailable = health.isSuccess;
  const library = documents.data?.documents ?? [];

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-semibold text-gray-900">
              AI Intelligence
            </h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Document intelligence powered by PixelRAG. This workspace is
            currently read-only and does not apply changes to StratAlign data.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={health.isFetching || documents.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              health.isFetching || documents.isFetching ? "animate-spin" : ""
            }`}
          />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <Server className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                PixelRAG service
              </h2>
              <p className="text-sm text-gray-500">
                Backend document-intelligence connection
              </p>
            </div>
          </div>

          <div className="mt-5">
            {health.isLoading && (
              <p className="text-sm text-gray-500">
                Checking service availability...
              </p>
            )}

            {health.isError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  Document intelligence is unavailable
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  StratAlign remains available; only the PixelRAG feature is
                  currently unavailable.
                </p>
              </div>
            )}

            {health.data && (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-500">Status</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {statusLabel(health.data.status)}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Version</dt>
                  <dd className="mt-1 font-medium text-gray-900">
                    {health.data.version}
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gray-100 p-2">
              <FileText className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">
                Document library
              </h2>
              <p className="text-sm text-gray-500">
                Documents currently available to PixelRAG
              </p>
            </div>
          </div>

          <div className="mt-5">
            {!serviceAvailable && !documents.isLoading && (
              <p className="text-sm text-gray-500">
                The document library will appear when PixelRAG is available.
              </p>
            )}

            {documents.isLoading && (
              <p className="text-sm text-gray-500">
                Loading documents...
              </p>
            )}

            {documents.isSuccess && library.length === 0 && (
              <p className="text-sm text-gray-500">
                No documents are currently available.
              </p>
            )}

            {library.length > 0 && (
              <div className="divide-y divide-gray-100">
                {library.map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {document.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {document.page_count === null
                          ? "Page count unavailable"
                          : `${document.page_count} page${
                              document.page_count === 1 ? "" : "s"
                            }`}
                        {" · "}
                        {formatBytes(document.size_bytes)}
                      </p>
                    </div>

                    <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {statusLabel(document.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <PixelRagComparePanel documents={library} />
    </div>
  );
}
