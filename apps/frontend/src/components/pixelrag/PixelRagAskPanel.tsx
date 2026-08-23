"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, FileSearch, Loader2, MessageSquareText, Sparkles } from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import PixelRagEvidenceImage from "./PixelRagEvidenceImage";

type DocumentOption = {
  id: string;
  name: string;
  status: "uploaded" | "processing" | "ready" | "failed";
};

export default function PixelRagAskPanel({
  documents,
  selectedDocumentId,
}: {
  documents: DocumentOption[];
  selectedDocumentId: string | null;
}) {
  const readyDocuments = useMemo(
    () => documents.filter((document) => document.status === "ready"),
    [documents],
  );
  const [question, setQuestion] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const select = trpc.pixelrag.selectDocument.useMutation();
  const ask = trpc.pixelrag.ask.useMutation();
  const compare = trpc.pixelrag.compare.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    const readyIds = new Set(readyDocuments.map((document) => document.id));
    setSelectedIds((current) => {
      const valid = current.filter((id) => readyIds.has(id)).slice(0, 3);
      if (valid.length > 0) return valid;
      if (selectedDocumentId && readyIds.has(selectedDocumentId)) return [selectedDocumentId];
      return [];
    });
  }, [readyDocuments, selectedDocumentId]);

  const toggleDocument = (documentId: string) => {
    setLocalError(null);
    ask.reset();
    compare.reset();
    setSelectedIds((current) => {
      if (current.includes(documentId)) return current.filter((id) => id !== documentId);
      if (current.length >= 3) {
        setLocalError("You can ask across up to three documents at a time.");
        return current;
      }
      return [...current, documentId];
    });
  };

  const runQuestion = async () => {
    const value = question.trim();
    if (!value) {
      setLocalError("Enter a question first.");
      return;
    }
    if (selectedIds.length === 0) {
      setLocalError("Select at least one ready document.");
      return;
    }

    setLocalError(null);
    ask.reset();
    compare.reset();

    try {
      if (selectedIds.length === 1) {
        const documentId = selectedIds[0]!;
        if (documentId !== selectedDocumentId) {
          await select.mutateAsync({ documentId });
          await utils.pixelrag.documents.invalidate();
        }
        await ask.mutateAsync({ question: value, topK: 3 });
        await utils.pixelrag.audit.invalidate();
        return;
      }

      await compare.mutateAsync({
        question: value,
        documentIds: selectedIds,
        topKPerDocument: 3,
      });
    } catch {
      // Mutation state renders the backend error below.
    }
  };

  const isPending = select.isPending || ask.isPending || compare.isPending;
  const selectedLabel = selectedIds.length === 1
    ? "1 document selected"
    : `${selectedIds.length} documents selected`;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-50 p-2">
            <MessageSquareText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Ask documents</h2>
            <p className="text-sm text-gray-500">
              Select one report for grounded Q&amp;A or select several to synthesise an answer across them.
            </p>
          </div>
        </div>
        {selectedIds.length > 0 && (
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {selectedLabel}
          </span>
        )}
      </div>

      {readyDocuments.length === 0 ? (
        <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          Upload and index a document before asking PixelRAG a question.
        </div>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {readyDocuments.map((document) => {
            const checked = selectedIds.includes(document.id);
            return (
              <button
                key={document.id}
                type="button"
                onClick={() => toggleDocument(document.id)}
                disabled={isPending}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                  checked
                    ? "border-blue-500 bg-blue-50 text-blue-900"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  checked ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                }`}>
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="truncate font-medium">{document.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="pixelrag-question" className="mb-1.5 block text-sm font-medium text-gray-700">Question</label>
        <textarea
          id="pixelrag-question"
          value={question}
          onChange={(event) => { setQuestion(event.target.value); setLocalError(null); }}
          rows={4}
          maxLength={1000}
          placeholder={selectedIds.length > 1 ? "What changed between these reports?" : "Why is customer satisfaction below target?"}
          className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <button
        type="button"
        onClick={() => void runQuestion()}
        disabled={isPending || selectedIds.length === 0}
        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedIds.length > 1 ? <FileSearch className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        {isPending ? "Analysing…" : "Ask PixelRAG"}
      </button>

      {(localError || ask.error || compare.error || select.error) && (
        <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {localError ?? ask.error?.message ?? compare.error?.message ?? select.error?.message}
        </div>
      )}

      {ask.data && (
        <div className="mt-6 space-y-5 border-t border-gray-100 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Answer</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{ask.data.answer}</p>
          </div>
          {ask.data.evidence.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Evidence</h3>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {ask.data.evidence.map((item, index) => (
                  <li key={`${index}-${item}`} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </div>
          )}
          {ask.data.tiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Visual sources</h3>
              <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ask.data.tiles.map((tile) => (
                  <PixelRagEvidenceImage
                    key={`${tile.article_id}-${tile.tile_index}-${tile.chunk_index}`}
                    documentId={ask.data.document_id}
                    articleId={tile.article_id}
                    tileIndex={tile.tile_index}
                    chunkIndex={tile.chunk_index}
                    score={tile.score}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {compare.data && (
        <div className="mt-6 space-y-4 border-t border-gray-100 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Synthesised answer</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{compare.data.answer}</p>
          </div>
          {compare.data.evidence.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Evidence</h3>
              <ul className="mt-2 space-y-2">
                {compare.data.evidence.map((item, index) => (
                  <li key={`${index}-${item}`} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {compare.data.sources.map((source) => (
              <article key={source.document_id} className="rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-900">{source.document_name}</p>
                <p className="mt-2 text-sm leading-6 text-gray-700">{source.answer}</p>
                {source.evidence.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs text-gray-500">
                    {source.evidence.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
