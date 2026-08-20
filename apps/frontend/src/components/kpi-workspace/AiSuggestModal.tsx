"use client";

import { useMemo, useState } from "react";
import {
  Sparkles, X, ChevronDown, Plus, Check, Pencil, AlertTriangle, Loader2, Info, ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type TypeFilter = "all" | "kpi" | "okr";

type Batch = NonNullable<ReturnType<typeof useGenerate>["data"]>;
type Suggestion = Batch["suggestions"][number];

function useGenerate() {
  return trpc.aiSuggestion.generate.useMutation();
}

/** Palette is keyed by theme name so a theme keeps one colour across renders. */
const THEME_TONES = [
  { badge: "bg-blue-600", accent: "bg-blue-600 hover:bg-blue-700" },
  { badge: "bg-emerald-500", accent: "bg-emerald-500 hover:bg-emerald-600" },
  { badge: "bg-indigo-600", accent: "bg-indigo-600 hover:bg-indigo-700" },
  { badge: "bg-rose-500", accent: "bg-rose-500 hover:bg-rose-600" },
  { badge: "bg-amber-500", accent: "bg-amber-500 hover:bg-amber-600" },
];

function toneFor(name: string) {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return THEME_TONES[hash % THEME_TONES.length];
}

/**
 * Mirrors `BLOCK_SIMILARITY_THRESHOLD` in the backend suggestion service.
 *
 * Duplicated deliberately: the server is the authority and will refuse an
 * unacknowledged candidate at or above this score regardless of what the client
 * believes. This copy exists only so the UI can ask for confirmation *before*
 * sending, rather than surfacing a refusal the reviewer cannot act on.
 */
const STRONG_DUPLICATE_THRESHOLD = 0.9;

function isStrongDuplicate(suggestion: Suggestion): boolean {
  return suggestion.duplicateMatches.some(
    (match) => match.similarity >= STRONG_DUPLICATE_THRESHOLD,
  );
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

/** Local edits, keyed by suggestion id. Absent means "as the model proposed". */
type EditDraft = {
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  unit: string;
  frequency: "monthly" | "quarterly";
  keyResultTargets: number[];
};

export default function AiSuggestModal({ onClose }: { onClose: () => void }) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [themeNodeId, setThemeNodeId] = useState("");
  const [resolved, setResolved] = useState<Record<string, "accepted" | "rejected">>({});
  const [edits, setEdits] = useState<Record<string, EditDraft>>({});
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * Suggestions whose duplicate warning the reviewer has explicitly overridden.
   * Nothing else may set this — it is the only source of
   * `acknowledgeDuplicate: true`.
   */
  const [confirmedDuplicates, setConfirmedDuplicates] = useState<Record<string, true>>({});
  /** Suggestion currently showing its duplicate-confirmation prompt. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const nodes = trpc.strategy.nodes.useQuery();
  const themes = useMemo(
    () => (nodes.data ?? []).filter((node) => node.type === "theme" && node.state !== "retired"),
    [nodes.data],
  );

  const generate = useGenerate();
  const accept = trpc.aiSuggestion.accept.useMutation();
  const acceptMany = trpc.aiSuggestion.acceptMany.useMutation();

  const batch = generate.data ?? null;

  const visible = (batch?.suggestions ?? []).filter((suggestion) => {
    if (resolved[suggestion.suggestionId]) return false;
    if (typeFilter !== "all" && suggestion.kind !== typeFilter) return false;
    return true;
  });

  const busy = generate.isPending || accept.isPending || acceptMany.isPending;

  /** What "Accept all" would actually submit — strong duplicates excluded. */
  const acceptAllCount = visible.filter(
    (suggestion) =>
      !isStrongDuplicate(suggestion) || confirmedDuplicates[suggestion.suggestionId],
  ).length;

  /** The payload the server re-validates. Edits win; everything else is as generated. */
  const toAcceptPayload = (suggestion: Suggestion) => {
    const draft = edits[suggestion.suggestionId];
    const keyResults = suggestion.okr?.keyResults.map((keyResult, index) => ({
      ...keyResult,
      targetValue: draft?.keyResultTargets[index] ?? keyResult.targetValue,
    }));

    return {
      suggestionId: suggestion.suggestionId,
      generationId: suggestion.generationId,
      themeNodeId: suggestion.themeNodeId,
      kind: suggestion.kind,
      titleEn: draft?.titleEn ?? suggestion.titleEn,
      titleAr: draft?.titleAr ?? suggestion.titleAr,
      descriptionEn: draft?.descriptionEn ?? suggestion.descriptionEn,
      descriptionAr: suggestion.descriptionAr,
      confidence: suggestion.confidence,
      provider: batch?.provider ?? "",
      model: batch?.model ?? "",
      edited: Boolean(draft),
      // Only ever true for a suggestion the reviewer explicitly confirmed. A
      // flag on its own is not consent: sending true just because a duplicate
      // was detected would make the server's guard unreachable from this UI.
      acknowledgeDuplicate: confirmedDuplicates[suggestion.suggestionId] === true,
      kpi: suggestion.kpi
        ? {
            unit: draft?.unit ?? suggestion.kpi.unit,
            frequency: draft?.frequency ?? suggestion.kpi.frequency,
            polarity: suggestion.kpi.polarity,
          }
        : null,
      okr: suggestion.okr ? { ...suggestion.okr, keyResults: keyResults ?? [] } : null,
    };
  };

  const runGenerate = async () => {
    setError(null);
    setNotice(null);
    setResolved({});
    setEdits({});
    setConfirmedDuplicates({});
    try {
      await generate.mutateAsync({
        themeNodeId,
        kinds: typeFilter === "all" ? ["kpi", "okr"] : [typeFilter],
        maxSuggestions: 8,
      });
    } catch (cause) {
      setError(message(cause));
    }
  };

  const acceptOne = async (suggestion: Suggestion) => {
    // A strong duplicate needs a second, deliberate action. Returning here
    // means no mutation is issued at all, so the reviewer cannot create a
    // near-identical record by clicking the same button they use for
    // everything else.
    if (isStrongDuplicate(suggestion) && !confirmedDuplicates[suggestion.suggestionId]) {
      setConfirming(suggestion.suggestionId);
      setNotice(null);
      setError(null);
      return;
    }

    setError(null);
    try {
      const result = await accept.mutateAsync(toAcceptPayload(suggestion));
      setResolved((prev) => ({ ...prev, [suggestion.suggestionId]: "accepted" }));
      setNotice(
        result.alreadyAccepted
          ? "This suggestion had already been accepted — nothing was created twice."
          : `Created as a ${result.subjectType === "okr" ? "new OKR" : "draft KPI"}.`,
      );
    } catch (cause) {
      setError(message(cause));
    }
  };

  const acceptAll = async () => {
    setError(null);

    // Unconfirmed strong duplicates are never swept up by a batch action. They
    // stay listed for individual review, which is the whole point of flagging
    // them.
    const withheld = visible.filter(
      (suggestion) =>
        isStrongDuplicate(suggestion) && !confirmedDuplicates[suggestion.suggestionId],
    );
    const submittable = visible.filter((suggestion) => !withheld.includes(suggestion));
    const payloads = submittable.map(toAcceptPayload);

    if (payloads.length === 0) {
      setNotice(
        withheld.length > 0
          ? `Nothing was created. ${withheld.length} possible duplicate(s) need individual review.`
          : null,
      );
      return;
    }

    try {
      const result = await acceptMany.mutateAsync({ suggestions: payloads });
      setResolved((prev) => {
        const next = { ...prev };
        for (const item of result.accepted) next[item.suggestionId] = "accepted";
        return next;
      });
      const withheldNote =
        withheld.length > 0
          ? ` ${withheld.length} possible duplicate(s) were left for individual review.`
          : "";
      setNotice(
        (result.failed.length === 0
          ? `Created ${result.accepted.length} item(s).`
          : `Created ${result.accepted.length} item(s); ${result.failed.length} could not be created and are still listed.`) +
          withheldNote,
      );
      if (result.failed.length > 0) {
        setError(result.failed.map((failure) => failure.message).join(" · "));
      }
    } catch (cause) {
      setError(message(cause));
    }
  };

  const reject = (suggestionId: string) => {
    // Purely local: rejection creates nothing and touches nothing persisted.
    setResolved((prev) => ({ ...prev, [suggestionId]: "rejected" }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-indigo-50/60 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Sparkles className="h-5 w-5 text-indigo-600" /> AI-Suggested OKRs &amp; KPIs
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Generated from the selected strategy theme, its place in the hierarchy, and the OKRs and KPIs it already has.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center overflow-hidden rounded-full border border-gray-200">
            {(["all", "okr", "kpi"] as TypeFilter[]).map((key) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`border-l border-gray-200 px-3.5 py-1.5 text-sm font-medium first:border-l-0 ${typeFilter === key ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {key.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative">
            <select
              value={themeNodeId}
              data-testid="theme-select"
              onChange={(event) => setThemeNodeId(event.target.value)}
              className="appearance-none rounded-full border border-gray-200 bg-white py-1.5 pl-3.5 pr-8 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none"
            >
              <option value="">Select a theme…</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.nameEn}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          <button
            data-testid="generate"
            onClick={() => void runGenerate()}
            disabled={!themeNodeId || busy}
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {batch ? "Regenerate" : "Generate"}
          </button>

          {visible.length > 0 && (
            <button
              data-testid="accept-all"
              onClick={() => void acceptAll()}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acceptMany.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Accept all ({acceptAllCount})
            </button>
          )}
        </div>

        {(error || notice) && (
          <div className="border-b border-gray-100 px-5 py-2 text-sm">
            {error && <p className="text-red-600">{error}</p>}
            {notice && <p className="text-emerald-700">{notice}</p>}
          </div>
        )}

        <div className="app-scroll flex-1 space-y-3 overflow-y-auto p-5">
          {generate.isPending && (
            <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating suggestions for this theme…
            </p>
          )}

          {!generate.isPending && !batch && (
            <p className="p-10 text-center text-sm text-gray-400">
              {themeNodeId
                ? "Choose Generate to propose OKRs and KPIs for this theme."
                : "Select a strategy theme to get started."}
            </p>
          )}

          {!generate.isPending && batch && visible.length === 0 && (
            <p className="p-10 text-center text-sm text-gray-400">
              {batch.suggestions.length === 0
                ? "The model had nothing new to propose for this theme."
                : "No remaining suggestions match this filter — you have reviewed them all."}
            </p>
          )}

          {!generate.isPending &&
            visible.map((suggestion) => {
              const tone = toneFor(suggestion.themeNameEn);
              const draft = edits[suggestion.suggestionId];
              const isEditing = editing === suggestion.suggestionId;
              const confidencePercent = Math.round(suggestion.confidence * 100);
              const strongDuplicate = isStrongDuplicate(suggestion);
              const isConfirmed = confirmedDuplicates[suggestion.suggestionId] === true;
              const isConfirming = confirming === suggestion.suggestionId;

              return (
                <div key={suggestion.suggestionId} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${tone.badge}`}>
                          {suggestion.themeNameEn}
                        </span>
                        <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                          {suggestion.kind.toUpperCase()}
                        </span>
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                          AI Suggested
                        </span>
                        <span
                          className="flex items-center gap-1 text-xs text-gray-400"
                          title="An estimate produced by the model, not a guarantee that the suggestion is correct."
                        >
                          AI confidence:{" "}
                          <span className={confidencePercent >= 80 ? "font-semibold text-emerald-600" : "font-semibold text-orange-500"}>
                            {confidencePercent}%
                          </span>
                          <Info className="h-3 w-3" />
                        </span>
                        {draft && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                            Edited
                          </span>
                        )}
                      </div>

                      {isEditing ? (
                        <EditForm
                          suggestion={suggestion}
                          draft={draft}
                          onCancel={() => setEditing(null)}
                          onSave={(next) => {
                            setEdits((prev) => ({ ...prev, [suggestion.suggestionId]: next }));
                            setEditing(null);
                          }}
                        />
                      ) : (
                        <>
                          <p className="text-[15px] font-semibold text-gray-900">
                            {draft?.titleEn ?? suggestion.titleEn}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-gray-500">
                            {draft?.descriptionEn ?? suggestion.descriptionEn ?? suggestion.rationale ?? ""}
                          </p>

                          {suggestion.kpi && (
                            <p className="mt-2 text-xs text-gray-400">
                              Unit: {draft?.unit ?? suggestion.kpi.unit} &nbsp;·&nbsp;
                              Freq: {draft?.frequency ?? suggestion.kpi.frequency} &nbsp;·&nbsp;
                              Direction: {suggestion.kpi.polarity === "higher_is_better" ? "higher is better" : "lower is better"}
                            </p>
                          )}

                          {suggestion.okr && (
                            <ul className="mt-2 space-y-1">
                              {suggestion.okr.keyResults.map((keyResult, index) => (
                                <li key={`${suggestion.suggestionId}-kr-${index}`} className="text-xs text-gray-500">
                                  • {keyResult.titleEn} —{" "}
                                  <span className="font-medium text-gray-700">
                                    {draft?.keyResultTargets[index] ?? keyResult.targetValue} {keyResult.unit}
                                  </span>{" "}
                                  ({keyResult.type})
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}

                      {suggestion.duplicateMatches.length > 0 && (
                        <div
                          data-testid={`duplicate-warning-${suggestion.suggestionId}`}
                          className={`mt-3 rounded-lg border p-2.5 ${
                            isConfirmed
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                          }`}
                        >
                          <p
                            className={`flex items-center gap-1.5 text-xs font-semibold ${
                              isConfirmed ? "text-emerald-800" : "text-amber-800"
                            }`}
                          >
                            {isConfirmed ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" /> Duplicate confirmed — will be created anyway
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="h-3.5 w-3.5" />{" "}
                                {strongDuplicate
                                  ? "Highly similar to an existing item"
                                  : "Possible existing item"}
                              </>
                            )}
                          </p>
                          {suggestion.duplicateMatches.map((match) => (
                            <p
                              key={`${match.kpiDefinitionId ?? match.okrId}`}
                              className={`mt-1 text-xs ${isConfirmed ? "text-emerald-700" : "text-amber-700"}`}
                            >
                              “{match.nameEn}” — similarity: {Math.round(match.similarity * 100)}%
                            </p>
                          ))}

                          {strongDuplicate && !isConfirmed && (
                            <div className="mt-2">
                              <p className="text-xs text-amber-800">
                                An existing item is highly similar to this suggestion. Creating it
                                will produce a near-duplicate in the library.
                              </p>
                              {isConfirming && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button
                                    data-testid={`confirm-duplicate-${suggestion.suggestionId}`}
                                    onClick={() => {
                                      setConfirmedDuplicates((prev) => ({
                                        ...prev,
                                        [suggestion.suggestionId]: true,
                                      }));
                                      setConfirming(null);
                                    }}
                                    disabled={busy}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                                  >
                                    Yes, create it anyway
                                  </button>
                                  <button
                                    onClick={() => setConfirming(null)}
                                    disabled={busy}
                                    className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    Keep reviewing
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        data-testid={`accept-${suggestion.suggestionId}`}
                        onClick={() => void acceptOne(suggestion)}
                        disabled={busy || isEditing}
                        className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                          strongDuplicate && !isConfirmed ? "bg-amber-600 hover:bg-amber-700" : tone.accent
                        }`}
                      >
                        {strongDuplicate && !isConfirmed ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" /> Review duplicate
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" /> Accept
                          </>
                        )}
                      </button>
                      <button
                        data-testid={`edit-${suggestion.suggestionId}`}
                        onClick={() => setEditing(isEditing ? null : suggestion.suggestionId)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        data-testid={`reject-${suggestion.suggestionId}`}
                        onClick={() => reject(suggestion.suggestionId)}
                        disabled={busy}
                        className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        <p className="border-t border-gray-100 px-5 py-2.5 text-xs text-gray-400">
          Nothing is created until you accept it. Accepted KPIs are created as drafts and still need the usual approval before publication.
        </p>
      </div>
    </div>
  );
}

function EditForm({
  suggestion, draft, onSave, onCancel,
}: {
  suggestion: Suggestion;
  draft: EditDraft | undefined;
  onSave: (draft: EditDraft) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<EditDraft>(
    draft ?? {
      titleEn: suggestion.titleEn,
      titleAr: suggestion.titleAr,
      descriptionEn: suggestion.descriptionEn ?? "",
      unit: suggestion.kpi?.unit ?? "",
      frequency: suggestion.kpi?.frequency ?? "monthly",
      keyResultTargets: suggestion.okr?.keyResults.map((keyResult) => keyResult.targetValue) ?? [],
    },
  );

  const field = "w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500";

  return (
    <div className="space-y-2">
      <input
        aria-label="Title (English)"
        className={field}
        value={value.titleEn}
        onChange={(event) => setValue({ ...value, titleEn: event.target.value })}
      />
      <input
        aria-label="Title (Arabic)"
        dir="rtl"
        className={field}
        value={value.titleAr}
        onChange={(event) => setValue({ ...value, titleAr: event.target.value })}
      />
      <textarea
        aria-label="Description"
        rows={2}
        className={field}
        value={value.descriptionEn}
        onChange={(event) => setValue({ ...value, descriptionEn: event.target.value })}
      />

      {suggestion.kpi && (
        <div className="flex gap-2">
          <input
            aria-label="Unit"
            className={field}
            value={value.unit}
            onChange={(event) => setValue({ ...value, unit: event.target.value })}
          />
          <select
            aria-label="Frequency"
            className={field}
            value={value.frequency}
            onChange={(event) =>
              setValue({ ...value, frequency: event.target.value as "monthly" | "quarterly" })
            }
          >
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
          </select>
        </div>
      )}

      {suggestion.okr?.keyResults.map((keyResult, index) => (
        <div key={`edit-kr-${index}`} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{keyResult.titleEn}</span>
          <input
            aria-label={`Target for ${keyResult.titleEn}`}
            type="number"
            className="w-28 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500"
            value={value.keyResultTargets[index] ?? keyResult.targetValue}
            onChange={(event) => {
              const targets = [...value.keyResultTargets];
              targets[index] = Number(event.target.value);
              setValue({ ...value, keyResultTargets: targets });
            }}
          />
          <span className="text-xs text-gray-400">{keyResult.unit}</span>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(value)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Save edits
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
