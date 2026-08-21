"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { newOwnerFromName, type KeyResult, type Objective } from "@/data/mockOkrLibrary";
import { trpc } from "@/lib/trpc/client";

type DraftKeyResult = { label: string; actual: string; target: string; dueDate: string };

const emptyKeyResult = (): DraftKeyResult => ({ label: "", actual: "", target: "", dueDate: "" });

/** The subset of a generated OKR suggestion this modal knows how to apply. */
type GeneratedOkrFields = {
  keyResults: DraftKeyResult[];
  /** The value AI wrote into the title field, or `null` if the title was
   * already non-empty and so was left untouched. */
  title: string | null;
};

type GeneratedOkr = {
  objectiveNodeId: string;
  keyResults: { titleEn: string; targetValue: number; unit: string }[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

function formatAiTarget(targetValue: number, unit: string): string {
  const trimmedUnit = unit.trim();
  return trimmedUnit ? `${targetValue} ${trimmedUnit}` : String(targetValue);
}

function keyResultsEqual(a: DraftKeyResult[], b: DraftKeyResult[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (kr, i) =>
      kr.label === b[i].label &&
      kr.actual === b[i].actual &&
      kr.target === b[i].target &&
      kr.dueDate === b[i].dueDate,
  );
}

export default function CreateOkrModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (objective: Objective) => void;
}) {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [quarter, setQuarter] = useState("Q3 2025");
  const [ownerName, setOwnerName] = useState("");
  const [keyResults, setKeyResults] = useState<DraftKeyResult[]>([emptyKeyResult()]);

  const [themeNodeId, setThemeNodeId] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  /** Kept as internal state only — the objective this suggestion hangs from.
   * Never rendered, never sent through `onCreate` (this modal's Create action
   * only ever writes local mock state, same as before Task 4). */
  const [aiObjectiveNodeId, setAiObjectiveNodeId] = useState<string | null>(null);
  /** Values right before the current suggestion was applied — restored on discard. */
  const [priorAiFields, setPriorAiFields] = useState<GeneratedOkrFields | null>(null);
  /** Values the current suggestion actually set — used to detect edits. */
  const [appliedAiFields, setAppliedAiFields] = useState<GeneratedOkrFields | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const nodes = trpc.strategy.nodes.useQuery();
  const themes = useMemo(
    () => (nodes.data ?? []).filter((node) => node.type === "theme" && node.state !== "retired"),
    [nodes.data],
  );
  const generate = trpc.aiSuggestion.generate.useMutation();

  const hasAiSuggestion = appliedAiFields !== null;
  const editedSinceSuggestion =
    appliedAiFields !== null &&
    ((appliedAiFields.title !== null && title !== appliedAiFields.title) ||
      !keyResultsEqual(keyResults, appliedAiFields.keyResults));

  const validKeyResults = keyResults.filter((kr) => kr.label.trim());
  const valid = title.trim().length > 0 && validKeyResults.length > 0;

  const updateKeyResult = (index: number, patch: Partial<DraftKeyResult>) => {
    setKeyResults((current) => current.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)));
  };

  const applySuggestion = (okr: GeneratedOkr, titleEn: string) => {
    const titleIsEmpty = title.trim().length === 0;
    const nextKeyResults: DraftKeyResult[] = okr.keyResults.map((kr) => ({
      label: kr.titleEn,
      actual: "",
      target: formatAiTarget(kr.targetValue, kr.unit),
      dueDate: "",
    }));
    const prior: GeneratedOkrFields = {
      keyResults,
      title: titleIsEmpty ? title : null,
    };
    const applied: GeneratedOkrFields = {
      keyResults: nextKeyResults,
      title: titleIsEmpty ? titleEn : null,
    };

    setKeyResults(applied.keyResults);
    if (applied.title !== null) setTitle(applied.title);
    setAiObjectiveNodeId(okr.objectiveNodeId);

    setPriorAiFields(prior);
    setAppliedAiFields(applied);
  };

  const runGenerate = async () => {
    setAiError(null);
    setAiNotice(null);
    try {
      const result = await generate.mutateAsync({
        themeNodeId,
        kinds: ["okr"],
        maxSuggestions: 1,
        userIntent: title.trim() || undefined,
      });
      const suggestion = result.suggestions[0];
      if (!suggestion || !suggestion.okr) {
        setAiNotice("The AI didn't have a suggestion for this theme. You can continue filling the form manually.");
        return;
      }
      applySuggestion(suggestion.okr, suggestion.titleEn);
    } catch (cause) {
      setAiError(errorMessage(cause));
    }
  };

  const handleAiSuggestClick = () => {
    if (!themeNodeId || generate.isPending) return;
    if (hasAiSuggestion && editedSinceSuggestion) {
      setConfirmingRegenerate(true);
      return;
    }
    void runGenerate();
  };

  const confirmRegenerate = () => {
    setConfirmingRegenerate(false);
    void runGenerate();
  };

  const discardAiSuggestion = () => {
    if (!priorAiFields) return;
    setKeyResults(priorAiFields.keyResults);
    if (priorAiFields.title !== null) setTitle(priorAiFields.title);
    setAiObjectiveNodeId(null);
    setPriorAiFields(null);
    setAppliedAiFields(null);
    setAiNotice(null);
    setAiError(null);
  };

  const handleCreate = () => {
    if (!valid) return;
    const owner = newOwnerFromName(ownerName || "Unassigned");
    const resolvedKeyResults: KeyResult[] = validKeyResults.map((kr, i) => ({
      id: `kr-custom-${Date.now()}-${i}`,
      label: kr.label.trim(),
      actual: kr.actual.trim() || "—",
      target: kr.target.trim() || "—",
      progress: 0,
      owner,
      status: "on-track",
      dueDate: kr.dueDate.trim() || "—",
    }));
    onCreate({
      id: `okr-custom-${Date.now()}`,
      title: title.trim(),
      department: department.trim() || "Unassigned",
      quarter,
      owner,
      status: "on-track",
      approval: "draft",
      progress: 0,
      keyResults: resolvedKeyResults,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-okr-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 id="create-okr-title" className="text-lg font-semibold text-gray-900">Create Objective</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="app-scroll flex-1 space-y-4 overflow-y-auto p-5">
          <Field label="Objective Name" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Drive Revenue Growth 40% YoY"
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <select
                  data-testid="okr-ai-theme-select"
                  value={themeNodeId}
                  onChange={(e) => setThemeNodeId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:border-indigo-500"
                >
                  <option value="">Select a theme…</option>
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.nameEn}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                data-testid="ai-suggest-okr"
                onClick={handleAiSuggestClick}
                disabled={!themeNodeId || generate.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Suggest
              </button>
              {hasAiSuggestion && (
                <button
                  type="button"
                  data-testid="discard-ai-suggestion-okr"
                  onClick={discardAiSuggestion}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Discard suggestion
                </button>
              )}
            </div>

            {confirmingRegenerate && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1">You&apos;ve edited the current suggestion. Generating again will replace those edits.</span>
                <button
                  type="button"
                  data-testid="confirm-regenerate-okr"
                  onClick={confirmRegenerate}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"
                >
                  Replace
                </button>
                <button
                  type="button"
                  data-testid="cancel-regenerate-okr"
                  onClick={() => setConfirmingRegenerate(false)}
                  className="rounded-lg border border-amber-300 px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-100"
                >
                  Cancel
                </button>
              </div>
            )}

            {hasAiSuggestion && !confirmingRegenerate && (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-indigo-700">
                <Sparkles className="h-3 w-3" /> AI Suggested — edit any field below, or discard.
              </p>
            )}
            {aiNotice && <p className="mt-2 text-xs text-gray-500">{aiNotice}</p>}
            {aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}

            {/* Internal only, per Task 4: the objective this suggestion hangs
                from is tracked for a future real-creation wiring, but is never
                a user-facing selector and never reaches `onCreate`. */}
            <input type="hidden" data-testid="ai-objective-node-id" value={aiObjectiveNodeId ?? ""} readOnly />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" className={inputClass} />
            </Field>
            <Field label="Quarter">
              <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className={inputClass}>
                <option value="Q1 2025">Q1 2025</option>
                <option value="Q2 2025">Q2 2025</option>
                <option value="Q3 2025">Q3 2025</option>
                <option value="Q4 2025">Q4 2025</option>
              </select>
            </Field>
          </div>

          <Field label="Owner Name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Sarah Chen" className={inputClass} />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Key Results <span className="text-red-500">*</span>
              </span>
              <button
                type="button"
                onClick={() => setKeyResults((current) => [...current, emptyKeyResult()])}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3.5 w-3.5" /> Add key result
              </button>
            </div>
            <div className="space-y-3">
              {keyResults.map((kr, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex items-start gap-2">
                    <input
                      value={kr.label}
                      onChange={(e) => updateKeyResult(index, { label: e.target.value })}
                      placeholder={`e.g. Achieve $48M ARR by Dec 2025`}
                      className={`${inputClass} flex-1`}
                    />
                    {keyResults.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setKeyResults((current) => current.filter((_, i) => i !== index))}
                        className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={kr.actual}
                      onChange={(e) => updateKeyResult(index, { actual: e.target.value })}
                      placeholder="Actual"
                      className={inputClass}
                    />
                    <input
                      value={kr.target}
                      onChange={(e) => updateKeyResult(index, { target: e.target.value })}
                      placeholder="Target"
                      className={inputClass}
                    />
                    <input
                      value={kr.dueDate}
                      onChange={(e) => updateKeyResult(index, { dueDate: e.target.value })}
                      placeholder="Due date"
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={handleCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            Create Objective
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
