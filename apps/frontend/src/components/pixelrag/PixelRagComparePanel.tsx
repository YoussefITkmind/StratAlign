"use client";

import { useState } from "react";
import {
  Check,
  FileSearch,
  Loader2,
  Sparkles,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";

type DocumentOption = {
  id: string;
  name: string;
  status: "uploaded" | "processing" | "ready" | "failed";
};

export default function PixelRagComparePanel({
  documents,
}: {
  documents: DocumentOption[];
}) {
  const [question, setQuestion] = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const compare = trpc.pixelrag.compare.useMutation();

  const readyDocuments = documents.filter(
    (document) => document.status === "ready",
  );

  const toggleDocument = (documentId: string) => {
    setValidationError(null);

    setSelectedDocumentIds((current) => {
      if (current.includes(documentId)) {
        return current.filter((id) => id !== documentId);
      }

      if (current.length >= 3) {
        setValidationError("You can select up to three documents.");
        return current;
      }

      return [...current, documentId];
    });
  };

  const runComparison = async () => {
    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setValidationError("Enter a question first.");
      return;
    }

    if (selectedDocumentIds.length === 0) {
      setValidationError("Select at least one ready document.");
      return;
    }

    setValidationError(null);

    await compare.mutateAsync({
      question: trimmedQuestion,
      documentIds: selectedDocumentIds,
      topKPerDocument: 3,
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-violet-50 p-2">
          <FileSearch className="h-5 w-5 text-violet-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">
            Ask across documents
          </h2>
          <p className="text-sm text-gray-500">
            Select up to three ready documents and ask PixelRAG a question.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {readyDocuments.length === 0 ? (
          <p className="text-sm text-gray-500">
            No ready documents are currently available for analysis.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {readyDocuments.map((document) => {
              const selected = selectedDocumentIds.includes(document.id);

              return (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => toggleDocument(document.id)}
                  className={`flex min-w-0 items-center gap-2 rounded-lg border p-3 text-left text-sm transition ${
                    selected
                      ? "border-blue-500 bg-blue-50 text-blue-900"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      selected
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </span>

                  <span className="truncate font-medium">
                    {document.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div>
          <label
            htmlFor="pixelrag-question"
            className="mb-1.5 block text-sm font-medium text-gray-700"
          >
            Question
          </label>

          <textarea
            id="pixelrag-question"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value);
              setValidationError(null);
            }}
            rows={3}
            maxLength={1000}
            placeholder="What do these documents say about our strategic priorities?"
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {validationError && (
          <p className="text-sm text-amber-700">
            {validationError}
          </p>
        )}

        {compare.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">
              PixelRAG could not complete this request.
            </p>
            <p className="mt-1 text-sm text-red-700">
              {compare.error.message}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void runComparison()}
          disabled={compare.isPending || readyDocuments.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {compare.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}

          {compare.isPending ? "Analysing..." : "Ask PixelRAG"}
        </button>

        {compare.data && (
          <div className="space-y-4 border-t border-gray-100 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Answer
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                {compare.data.answer}
              </p>
            </div>

            {compare.data.evidence.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Evidence
                </h3>
                <ul className="mt-2 space-y-2">
                  {compare.data.evidence.map((evidence, index) => (
                    <li
                      key={`${index}-${evidence}`}
                      className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700"
                    >
                      {evidence}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {compare.data.sources.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Document sources
                </h3>

                <div className="mt-2 space-y-3">
                  {compare.data.sources.map((source) => (
                    <article
                      key={source.document_id}
                      className="rounded-lg border border-gray-200 p-3"
                    >
                      <p className="text-sm font-semibold text-gray-900">
                        {source.document_name}
                      </p>

                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {source.answer}
                      </p>

                      {source.evidence.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-500">
                          {source.evidence.map((evidence, index) => (
                            <li key={`${index}-${evidence}`}>
                              • {evidence}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
