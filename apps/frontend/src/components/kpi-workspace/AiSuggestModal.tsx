"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, X, Globe, ArrowRight, ChevronDown, Plus, Check, Pencil,
  AlertTriangle, Loader2, Info, ShieldCheck,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";

/**
 * Kind of proposal. Previously imported from the KPI suggestion mock data;
 * that file is gone now the modal is backed by the real generation API, so the
 * union is declared here and kept identical so `initialTypeFilter="okr"` at
 * existing call sites still type-checks.
 */
type SuggestionKind = "okr" | "kpi";
type TypeFilter = "all" | SuggestionKind;

/**
 * How the generated batch is presented: everything at once, or one card at a
 * time with a cursor that advances as each item is resolved.
 */
type Mode = "global" | "one-by-one";

type Batch = NonNullable<ReturnType<typeof useGenerate>["data"]>;
type Suggestion = Batch["suggestions"][number];

/**
 * What the card list actually renders. `provider`/`model` are carried per
 * suggestion (not read off a single shared batch) because "Global (All
 * Themes)" merges suggestions generated from several independent per-theme
 * batches — each one may have been produced by a different call, so the
 * accept payload must use the batch that suggestion actually came from.
 */
type DisplaySuggestion = Suggestion & { provider: string; model: string };

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

function isStrongDuplicate(suggestion: DisplaySuggestion): boolean {
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

/**
 * AI generation is English-only (see `suggestion.prompt.ts`) — the model
 * never fills `titleAr`. The registry still requires a non-empty Arabic
 * name to create anything (`KpiRegistryService.createDraft`/`OkrService
 * .create` both refuse an empty one), so a reviewer must supply it here
 * before accepting. This never falls back to inventing or duplicating
 * English text into the Arabic field.
 */
function effectiveTitleAr(suggestion: DisplaySuggestion, draft: EditDraft | undefined): string {
  return (draft?.titleAr ?? suggestion.titleAr ?? "").trim();
}

function missingArabicTitle(suggestion: DisplaySuggestion, draft: EditDraft | undefined): boolean {
  return effectiveTitleAr(suggestion, draft).length === 0;
}

export default function AiSuggestModal({
  onClose,
  initialMode = "global",
  initialTypeFilter = "kpi",
}: {
  onClose: () => void;
  initialMode?: Mode;
  initialTypeFilter?: TypeFilter;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialTypeFilter);
  /**
   * Dual purpose, by design: in "one-by-one" mode this is the one theme
   * Generate targets. In "global" mode it is optional — empty means "every
   * active theme" (fanned out on Generate) and also narrows which already-
   * generated cards are shown, mirroring the "All Themes" filter in the
   * design.
   */
  const [themeNodeId, setThemeNodeId] = useState("");
  const [cursor, setCursor] = useState(0);
  /** Suggestions merged from a "Global (All Themes)" fan-out. Null until one runs. */
  const [manualSuggestions, setManualSuggestions] = useState<DisplaySuggestion[] | null>(null);
  /** True only while the in-flight/last generate spanned every theme, for copy. */
  const [wasFanOut, setWasFanOut] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
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

  const rawBatch = generate.data ?? null;
  /**
   * The working list, always enriched with the provider/model that produced
   * each item. `manualSuggestions` (a merge across themes) wins when present;
   * otherwise this falls back to the single most recent generate call.
   */
  const suggestions: DisplaySuggestion[] =
    manualSuggestions ??
    (rawBatch
      ? rawBatch.suggestions.map((suggestion) => ({
          ...suggestion,
          provider: rawBatch.provider,
          model: rawBatch.model,
        }))
      : []);
  const hasBatch = manualSuggestions !== null || rawBatch !== null;

  /** Everything still awaiting a decision, after the kind and (in global mode) theme filter. */
  const reviewable = suggestions.filter((suggestion) => {
    if (resolved[suggestion.suggestionId]) return false;
    if (typeFilter !== "all" && suggestion.kind !== typeFilter) return false;
    if (mode === "global" && themeNodeId && suggestion.themeNodeId !== themeNodeId) return false;
    return true;
  });

  // "One By One" narrows what is shown, never what a batch action operates on.
  const visible = mode === "one-by-one" ? reviewable.slice(cursor, cursor + 1) : reviewable;

  const busy = isGenerating || generate.isPending || accept.isPending || acceptMany.isPending;

  /** What "Accept all" would actually submit — strong duplicates and items missing a required Arabic title excluded. */
  const acceptAllCount = reviewable.filter(
    (suggestion) =>
      (!isStrongDuplicate(suggestion) || confirmedDuplicates[suggestion.suggestionId]) &&
      !missingArabicTitle(suggestion, edits[suggestion.suggestionId]),
  ).length;

  /** Keeps the one-by-one cursor inside the list as items are resolved. */
  const advanceCursor = () =>
    setCursor((current) => Math.min(current, Math.max(0, reviewable.length - 2)));

  /** The payload the server re-validates. Edits win; everything else is as generated. */
  const toAcceptPayload = (suggestion: DisplaySuggestion) => {
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
      // Never null/undefined here — the Add action is disabled until this
      // is non-empty (see `missingArabicTitle`), so this always resolves to
      // whatever the reviewer actually supplied.
      titleAr: effectiveTitleAr(suggestion, draft),
      descriptionEn: draft?.descriptionEn ?? suggestion.descriptionEn,
      descriptionAr: suggestion.descriptionAr,
      confidence: suggestion.confidence,
      provider: suggestion.provider,
      model: suggestion.model,
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
    setConfirming(null);
    setCursor(0);
    setManualSuggestions(null);
    setWasFanOut(false);
    setIsGenerating(true);

    const filteredKinds: SuggestionKind[] = typeFilter === "all" ? ["kpi", "okr"] : [typeFilter];

    try {
      if (mode === "global" && !themeNodeId) {
        // "Global (All Themes)" with nothing narrowed down: fan out one
        // generate call per active theme (each still scoped to just that
        // theme, matching the prompt's "stay inside that theme's scope" rule)
        // and merge the results so every real theme from the hierarchy is
        // represented at once, the way the design shows. Always ask for both
        // kinds here regardless of the current tab — ALL/OKR/KPI need to stay
        // pure display filters over one fetch, the same way the theme
        // dropdown already filters without re-generating. Fetching only the
        // active tab's kind would leave the other tab looking empty until a
        // manual Regenerate, which reads as broken rather than filtered.
        setWasFanOut(true);
        const targets = themes;
        const settled = await Promise.allSettled(
          targets.map((theme) =>
            generate.mutateAsync({ themeNodeId: theme.id, kinds: ["kpi", "okr"], maxSuggestions: 8 }),
          ),
        );

        const merged: DisplaySuggestion[] = [];
        const failures: string[] = [];
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            for (const suggestion of result.value.suggestions) {
              merged.push({ ...suggestion, provider: result.value.provider, model: result.value.model });
            }
          } else {
            failures.push(`${targets[index].nameEn}: ${message(result.reason)}`);
          }
        });

        setManualSuggestions(merged);
        if (failures.length > 0) setError(failures.join(" · "));
      } else {
        // One theme, deliberately picked (One By One, or Global with a
        // theme chosen): honour the active tab as the actual request, not
        // just a display filter — a reviewer scoping to one theme is asking
        // for that kind specifically, not browsing everything.
        await generate.mutateAsync({ themeNodeId, kinds: filteredKinds, maxSuggestions: 8 });
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Global mode opens straight into results, matching the design — the
   * reviewer shouldn't have to click Generate just to see what the model has
   * to say. Fires once, as soon as the real theme list has loaded, and never
   * again for this mount (Regenerate stays a manual action after that).
   * One By One still requires picking a theme, so it has nothing to auto-run.
   *
   * Deferred a tick via setTimeout so the state resets `runGenerate` makes up
   * front land as their own update rather than synchronously inside this
   * effect, and read through a ref so the effect doesn't need `runGenerate`
   * (a new function every render) in its dependency array.
   */
  const runGenerateRef = useRef(runGenerate);
  useEffect(() => {
    runGenerateRef.current = runGenerate;
  });

  const hasAutoGenerated = useRef(false);
  useEffect(() => {
    if (hasAutoGenerated.current) return;
    if (mode !== "global") return;
    if (nodes.isLoading || nodes.isError) return;
    if (themes.length === 0) return;

    hasAutoGenerated.current = true;
    const timer = setTimeout(() => void runGenerateRef.current(), 0);
    return () => clearTimeout(timer);
  }, [mode, nodes.isLoading, nodes.isError, themes.length]);

  const acceptOne = async (suggestion: DisplaySuggestion) => {
    // AI generation is English-only and never fills titleAr, but the
    // registry still requires a non-empty Arabic name to create anything —
    // block here rather than let the reviewer hit a raw backend rejection.
    if (missingArabicTitle(suggestion, edits[suggestion.suggestionId])) {
      setNotice(null);
      setError("Add an Arabic title before adding this suggestion — use Edit to supply one.");
      return;
    }

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
      advanceCursor();
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

    // AI generation never fills titleAr (English-only) — these need a
    // reviewer-supplied Arabic name before they can be created, same as
    // acceptOne. Never swept into a batch submission unfilled.
    const missingArabic = reviewable.filter((suggestion) =>
      missingArabicTitle(suggestion, edits[suggestion.suggestionId]),
    );
    // Unconfirmed strong duplicates are never swept up by a batch action. They
    // stay listed for individual review, which is the whole point of flagging
    // them.
    const withheld = reviewable.filter(
      (suggestion) =>
        !missingArabic.includes(suggestion) &&
        isStrongDuplicate(suggestion) &&
        !confirmedDuplicates[suggestion.suggestionId],
    );
    const submittable = reviewable.filter(
      (suggestion) => !withheld.includes(suggestion) && !missingArabic.includes(suggestion),
    );
    const payloads = submittable.map(toAcceptPayload);

    // Additive, not a replacement for the existing duplicate-withheld
    // messaging below — kept as its own sentence so that copy stays
    // unchanged for reviewers who never hit the Arabic-title case.
    const missingArabicNote =
      missingArabic.length > 0 ? ` ${missingArabic.length} still need an Arabic title.` : "";

    if (payloads.length === 0) {
      setNotice(
        withheld.length > 0
          ? `Nothing was created. ${withheld.length} possible duplicate(s) need individual review.${missingArabicNote}`
          : missingArabicNote
            ? `Nothing was created.${missingArabicNote}`
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
      setCursor(0);
      const withheldNote =
        (withheld.length > 0
          ? ` ${withheld.length} possible duplicate(s) were left for individual review.`
          : "") + missingArabicNote;
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
    advanceCursor();
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
              Generated from your strategy themes, each one&apos;s place in the hierarchy, and the OKRs and KPIs it already has.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center overflow-hidden rounded-full border border-gray-200">
            <button
              data-testid="mode-global"
              onClick={() => setMode("global")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium ${mode === "global" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Globe className="h-3.5 w-3.5" /> Global (All Themes)
            </button>
            <button
              data-testid="mode-one-by-one"
              onClick={() => { setMode("one-by-one"); setCursor(0); }}
              className={`flex items-center gap-1.5 border-l border-gray-200 px-3.5 py-1.5 text-sm font-medium ${mode === "one-by-one" ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <ArrowRight className="h-3.5 w-3.5" /> One By One
            </button>
          </div>

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
              data-testid="theme-select"
              value={themeNodeId}
              onChange={(event) => setThemeNodeId(event.target.value)}
              disabled={nodes.isLoading || nodes.isError}
              className="appearance-none rounded-full border border-gray-200 bg-white py-1.5 pl-3.5 pr-8 text-sm font-medium text-gray-600 hover:bg-gray-50 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {nodes.isLoading
                  ? "Loading themes…"
                  : nodes.isError
                    ? "Couldn't load themes"
                    : themes.length === 0
                      ? "No themes yet"
                      : mode === "global"
                        ? "All Themes"
                        : "Select a theme…"}
              </option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.nameEn}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>

          {nodes.isError && (
            <button
              data-testid="retry-themes"
              onClick={() => void nodes.refetch()}
              className="rounded-full border border-red-200 bg-red-50 px-3.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}

          <button
            data-testid="generate"
            onClick={() => void runGenerate()}
            disabled={busy || (mode === "one-by-one" ? !themeNodeId : themes.length === 0)}
            className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {isGenerating || generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {hasBatch ? "Regenerate" : "Generate"}
          </button>

          {reviewable.length > 0 && (
            <button
              data-testid="accept-all"
              onClick={() => void acceptAll()}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {acceptMany.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Add all ({acceptAllCount})
            </button>
          )}
        </div>

        {nodes.isError && (
          <div className="border-b border-gray-100 bg-red-50 px-5 py-2 text-sm text-red-600">
            Couldn&apos;t load strategy themes: {message(nodes.error)}
          </div>
        )}

        {(error || notice) && (
          <div className="border-b border-gray-100 px-5 py-2 text-sm">
            {error && <p className="text-red-600">{error}</p>}
            {notice && <p className="text-emerald-700">{notice}</p>}
          </div>
        )}

        <div className="app-scroll flex-1 space-y-3 overflow-y-auto p-5">
          {(isGenerating || generate.isPending) && (
            <p className="flex items-center justify-center gap-2 p-10 text-sm text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" />{" "}
              {wasFanOut
                ? "Generating suggestions across every strategy theme…"
                : "Generating suggestions for this theme…"}
            </p>
          )}

          {!(isGenerating || generate.isPending) && !hasBatch && (
            <p className="p-10 text-center text-sm text-gray-400">
              {nodes.isError
                ? "Themes failed to load — use Retry above, or try again after refreshing."
                : nodes.isLoading
                  ? "Loading strategy themes…"
                  : themes.length === 0
                    ? "No strategy themes exist yet — create one before generating suggestions."
                    : themeNodeId
                      ? "Choose Generate to propose OKRs and KPIs for this theme."
                      : mode === "global"
                        ? "Choose Generate to propose OKRs and KPIs across every strategy theme."
                        : "Select a strategy theme to get started."}
            </p>
          )}

          {!(isGenerating || generate.isPending) && hasBatch && visible.length === 0 && (
            <p className="p-10 text-center text-sm text-gray-400">
              {suggestions.length === 0
                ? wasFanOut
                  ? "The model had nothing new to propose across your strategy themes."
                  : "The model had nothing new to propose for this theme."
                : "No remaining suggestions match this filter — you have reviewed them all."}
            </p>
          )}

          {!(isGenerating || generate.isPending) &&
            visible.map((suggestion) => {
              const tone = toneFor(suggestion.themeNameEn);
              const draft = edits[suggestion.suggestionId];
              const isEditing = editing === suggestion.suggestionId;
              const confidencePercent = Math.round(suggestion.confidence * 100);
              const strongDuplicate = isStrongDuplicate(suggestion);
              const isConfirmed = confirmedDuplicates[suggestion.suggestionId] === true;
              const isConfirming = confirming === suggestion.suggestionId;
              const missingArabic = missingArabicTitle(suggestion, draft);

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

                      {!isEditing && missingArabic && (
                        <div
                          data-testid={`missing-arabic-${suggestion.suggestionId}`}
                          className="mt-3 flex items-start gap-1.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800"
                        >
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            The AI writes English only. Use Edit to add the Arabic title required
                            before this can be added.
                          </span>
                        </div>
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
                        disabled={busy || isEditing || missingArabic}
                        title={missingArabic ? "Use Edit to add the required Arabic title first" : undefined}
                        className={`flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                          strongDuplicate && !isConfirmed ? "bg-amber-600 hover:bg-amber-700" : tone.accent
                        }`}
                      >
                        {strongDuplicate && !isConfirmed ? (
                          <>
                            <AlertTriangle className="h-3.5 w-3.5" /> Review duplicate
                          </>
                        ) : missingArabic ? (
                          <>
                            <Info className="h-3.5 w-3.5" /> Needs Arabic title
                          </>
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" /> Add
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
                        Skip
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
      // The AI never fills this (English-only generation) — starts empty
      // unless the reviewer previously edited it.
      titleAr: suggestion.titleAr ?? "",
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
        aria-label="Title (Arabic) — required before adding"
        dir="rtl"
        placeholder="العنوان بالعربية (مطلوب)"
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
