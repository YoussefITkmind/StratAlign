"use client";

import { useMemo, useState } from "react";
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
  const [compareQuestion, setCompareQuestion] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const select = trpc.pixelrag.selectDocument.useMutation();
  const ask = trpc.pixelrag.ask.useMutation();
  const compare = trpc.pixelrag.compare.useMutation();
  const utils = trpc.useUtils();

  const activeDocument = readyDocuments.find((document) => document.id === selectedDocumentId) ?? null;

  const runAsk = async () => {
    const value = question.trim();
    if (!value) {
      setLocalError("Enter a question first.");
      return;
    }
    if (!activeDocument) {
      setLocalError("Select a ready document in the Documents tab first.");
      return;
    }

    setLocalError(null);
    try {
      await ask.mutateAsync({ question: value, topK: 3 });
      await utils.pixelrag.audit.invalidate();
    } catch {
      // Mutation state renders the backend error below.
    }
  };

  const toggleDocument = (documentId: string) => {
    setLocalError(null);
    setSelectedIds((current) => {
      if (current.includes(documentId)) return current.filter((id) => id !== documentId);
      if (current.length >= 3) {
        setLocalError("You can compare up to three documents.");
        return current;
      }
      return [...current, documentId];
    });
  };

  const runCompare = async () => {
    const value = compareQuestion.trim();
    if (!value) {
      setLocalError("Enter a comparison question first.");
      return;
    }
    if (selectedIds.length === 0) {
      setLocalError("Select at least one ready document.");
      return;
    }

    setLocalError(null);
    try {
      await compare.mutateAsync({
        question: value,
        documentIds: selectedIds,
        topKPerDocument: 3,
      });
    } catch {
      // Mutation state renders the backend error below.
    }
  };

  const chooseForAsk = async (documentId: string) => {
    if (documentId === selectedDocumentId) return;
    try {
      await select.mutateAsync({ documentId });
      ask.reset();
      await utils.pixelrag.documents.invalidate();
    } catch {
      // Mutation state is shown below.
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2">
              <MessageSquareText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Ask the selected document</h2>
              <p className="text-sm text-gray-500">Grounded answers include retrieved text and the actual visual evidence tiles.</p>
            </div>
          </div>
          {activeDocument && (
            <span className="max-w-sm truncate rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {activeDocument.name}
            </span>
          )}
        </div>

        {readyDocuments.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {readyDocuments.map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={() => void chooseForAsk(document.id)}
                disabled={select.isPending}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  document.id === selectedDocumentId
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {document.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          <label htmlFor="pixelrag-single-question" className="mb-1.5 block text-sm font-medium text-gray-700">Question</label>
          <textarea
            id="pixelrag-single-question"
            value={question}
            onChange={(event) => { setQuestion(event.target.value); setLocalError(null); }}
            rows={3}
            maxLength={1000}
            placeholder="Why is customer satisfaction below target?"
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          onClick={() => void runAsk()}
          disabled={ask.isPending || !activeDocument}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {ask.isPending ? "Analysing…" : "Ask PixelRAG"}
        </button>

        {(localError || ask.error || select.error) && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {localError ?? ask.error?.message ?? select.error?.message}
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
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-50 p-2"><FileSearch className="h-5 w-5 text-violet-600" /></div>
          <div>
            <h2 className="font-semibold text-gray-900">Ask across documents</h2>
            <p className="text-sm text-gray-500">Compare evidence from up to three indexed reports.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {readyDocuments.map((document) => {
            const checked = selectedIds.includes(document.id);
            return (
              <button
                key={document.id}
                type="button"
                onClick={() => toggleDocument(document.id)}
                className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm ${checked ? "border-violet-500 bg-violet-50 text-violet-900" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${checked ? "border-violet-600 bg-violet-600 text-white" : "border-gray-300"}`}>
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="truncate font-medium">{document.name}</span>
              </button>
            );
          })}
        </div>

        <textarea
          value={compareQuestion}
          onChange={(event) => { setCompareQuestion(event.target.value); setLocalError(null); }}
          rows={3}
          maxLength={1000}
          placeholder="What changed between these reports?"
          className="mt-4 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
        />
        <button
          type="button"
          onClick={() => void runCompare()}
          disabled={compare.isPending || readyDocuments.length === 0}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {compare.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSearch className="h-4 w-4" />}
          {compare.isPending ? "Comparing…" : "Compare documents"}
        </button>

        {compare.error && (
          <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{compare.error.message}</div>
        )}

        {compare.data && (
          <div className="mt-6 space-y-4 border-t border-gray-100 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Synthesised answer</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{compare.data.answer}</p>
            </div>
            {compare.data.evidence.length > 0 && (
              <ul className="space-y-2">
                {compare.data.evidence.map((item, index) => <li key={`${index}-${item}`} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{item}</li>)}
              </ul>
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
    </div>
  );
}
