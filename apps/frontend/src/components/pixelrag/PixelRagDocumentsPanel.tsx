"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";

type DocumentRecord = {
  id: string;
  name: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  uploaded_at: string;
  page_count: number | null;
  size_bytes: number;
  error: string | null;
  legacy: boolean;
  original_type: string;
  normalized_from: string | null;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the selected file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read the selected file"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function statusClasses(status: DocumentRecord["status"]): string {
  if (status === "ready") return "bg-emerald-50 text-emerald-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "processing") return "bg-blue-50 text-blue-700";
  return "bg-gray-100 text-gray-700";
}

export default function PixelRagDocumentsPanel({
  documents,
  selectedDocumentId,
}: {
  documents: DocumentRecord[];
  selectedDocumentId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DocumentRecord | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const upload = trpc.pixelrag.uploadDocument.useMutation();
  const select = trpc.pixelrag.selectDocument.useMutation();
  const reindex = trpc.pixelrag.reindexDocument.useMutation();
  const remove = trpc.pixelrag.removeDocument.useMutation();

  const refreshRelated = async () => {
    await Promise.all([
      utils.pixelrag.documents.invalidate(),
      utils.pixelrag.audit.invalidate(),
      utils.pixelrag.workflows.invalidate(),
    ]);
  };

  const handleUpload = async (file: File) => {
    setLocalError(null);
    if (file.size > 50 * 1024 * 1024) {
      setLocalError("The maximum document size is 50 MB.");
      return;
    }

    try {
      const dataBase64 = await fileAsBase64(file);
      await upload.mutateAsync({
        filename: file.name,
        ...(file.type ? { contentType: file.type } : {}),
        dataBase64,
      });
      await refreshRelated();
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Document upload failed");
    }
  };

  const handleSelect = async (documentId: string) => {
    setOperationId(documentId);
    setLocalError(null);
    try {
      await select.mutateAsync({ documentId });
      await utils.pixelrag.documents.invalidate();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not select the document");
    } finally {
      setOperationId(null);
    }
  };

  const handleReindex = async (documentId: string) => {
    setOperationId(documentId);
    setLocalError(null);
    try {
      await reindex.mutateAsync({ documentId });
      await refreshRelated();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not re-index the document");
      await utils.pixelrag.documents.invalidate();
    } finally {
      setOperationId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const documentId = confirmDelete.id;
    setOperationId(documentId);
    setLocalError(null);
    try {
      await remove.mutateAsync({ documentId });
      setConfirmDelete(null);
      await refreshRelated();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not delete the document");
    } finally {
      setOperationId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2"><Upload className="h-5 w-5 text-blue-600" /></div>
            <div>
              <h2 className="font-semibold text-gray-900">Add performance documents</h2>
              <p className="text-sm text-gray-500">PDF, DOCX, PPTX, XLSX, PNG and JPG · maximum 50 MB.</p>
            </div>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">
            {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {upload.isPending ? "Uploading & indexing…" : "Upload document"}
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg"
              disabled={upload.isPending}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
          New documents are normalised, visually chunked and indexed by PixelRAG. When remote embeddings are configured, Qwen inference runs on the remote GPU while the FAISS index stays in the PixelRAG service.
        </div>

        {localError && <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{localError}</div>}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <FileText className="h-5 w-5 text-gray-500" />
          <div>
            <h2 className="font-semibold text-gray-900">Document library</h2>
            <p className="text-sm text-gray-500">{documents.length} document{documents.length === 1 ? "" : "s"} available to this PixelRAG service.</p>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">Upload a document to start building the intelligence workspace.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {documents.map((document) => {
              const selected = document.id === selectedDocumentId;
              const busy = operationId === document.id;
              return (
                <article key={document.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{document.name}</p>
                      {selected && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700">
                          <CheckCircle2 className="h-3 w-3" /> Active source
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusClasses(document.status)}`}>{document.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {document.page_count ?? "—"} page{document.page_count === 1 ? "" : "s"} · {formatBytes(document.size_bytes)} · {document.original_type.toUpperCase()}
                      {document.normalized_from ? ` · normalised from ${document.normalized_from.toUpperCase()}` : ""}
                    </p>
                    {document.error && <p className="mt-2 text-xs text-red-600">{document.error}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSelect(document.id)}
                      disabled={busy || document.status !== "ready" || selected}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selected ? "Selected" : "Use document"}
                    </button>
                    {!document.legacy && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleReindex(document.id)}
                          disabled={busy || reindex.isPending || remove.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {busy && reindex.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          Re-index
                        </button>
                        <button
                          type="button"
                          onClick={() => { setLocalError(null); setConfirmDelete(document); }}
                          disabled={busy || reindex.isPending || remove.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busy && remove.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void utils.pixelrag.documents.invalidate()}
          className="inline-flex items-center gap-2 text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh library
        </button>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="pixelrag-delete-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="pixelrag-delete-title" className="text-lg font-semibold text-gray-900">Delete document?</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  This will remove <span className="font-medium text-gray-900">{confirmDelete.name}</span> from PixelRAG and delete its local source, index, cached analysis and proposals.
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-500">StratAlign business data is not changed.</p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={remove.isPending}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50"
                aria-label="Close delete confirmation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={remove.isPending}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={remove.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {remove.isPending ? "Deleting…" : "Delete document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
