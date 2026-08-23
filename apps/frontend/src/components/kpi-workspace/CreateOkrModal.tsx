"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { newOwnerFromName, type KeyResult, type Objective } from "@/data/mockOkrLibrary";
import { trpc } from "@/lib/trpc/client";

type DraftKeyResult = { label: string; actual: string; target: string; dueDate: string };

const emptyKeyResult = (): DraftKeyResult => ({ label: "", actual: "", target: "", dueDate: "" });

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not generate a suggestion.";
}

function keyResultsEqual(a: DraftKeyResult[], b: DraftKeyResult[]): boolean {
  return (
    a.length === b.length &&
    a.every((kr, i) => kr.label === b[i].label && kr.actual === b[i].actual && kr.target === b[i].target && kr.dueDate === b[i].dueDate)
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
  type AiFields = { title: string; keyResults: DraftKeyResult[] };
  /** Snapshot of the AI-touched fields right before the last suggestion was applied. */
  const [priorSnapshot, setPriorSnapshot] = useState<AiFields | null>(null);
  /** Snapshot of the AI-touched fields exactly as applied — used to detect hand-edits. */
  const [appliedSnapshot, setAppliedSnapshot] = useState<AiFields | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const nodes = trpc.strategy.nodes.useQuery();
  const themes = useMemo(
    () => (nodes.data ?? []).filter((node) => node.type === "theme" && node.state !== "retired"),
    [nodes.data],
  );
  const generate = trpc.aiSuggestion.generate.useMutation();

  const hasHandEdited =
    appliedSnapshot !== null &&
    (title !== appliedSnapshot.title || !keyResultsEqual(keyResults, appliedSnapshot.keyResults));

  const validKeyResults = keyResults.filter((kr) => kr.label.trim());
  const valid = title.trim().length > 0 && validKeyResults.length > 0;

  const updateKeyResult = (index: number, patch: Partial<DraftKeyResult>) => {
    setKeyResults((current) => current.map((kr, i) => (i === index ? { ...kr, ...patch } : kr)));
  };

  const applySuggestion = (suggestion: {
    titleEn: string;
    okr: { keyResults: { titleEn: string; targetValue: number; unit: string }[] } | null;
  }) => {
    setPriorSnapshot({ title, keyResults });
    const nextTitle = title.trim().length > 0 ? title : suggestion.titleEn;
    const suggestedKeyResults: DraftKeyResult[] = (suggestion.okr?.keyResults ?? []).map((kr) => ({
      label: kr.titleEn,
      actual: "",
      target: `${kr.targetValue} ${kr.unit}`,
      dueDate: "",
    }));
    const nextKeyResults = suggestedKeyResults.length > 0 ? suggestedKeyResults : keyResults;
    setTitle(nextTitle);
    setKeyResults(nextKeyResults);
    setAppliedSnapshot({ title: nextTitle, keyResults: nextKeyResults });
  };

  const runAiSuggest = async (force = false, isRetry = false) => {
    if (!themeNodeId || generate.isPending) return;
    if (hasHandEdited && !force) {
      setConfirmingRegenerate(true);
      return;
    }
    setConfirmingRegenerate(false);
    setAiError(null);
    setAiNotice(null);
    try {
      // Ask for a small pool, not just one: an OKR suggestion is only usable if
      // the model's chosen objectiveNodeId matches a real objective under this
      // theme, so requesting a single candidate makes "nothing came back usable"
      // (and, separately, "every candidate was malformed") far likelier than
      // they need to be.
      const result = await generate.mutateAsync({ themeNodeId, kinds: ["okr"], maxSuggestions: 5 });
      const suggestion = result.suggestions[0];
      if (!suggestion) {
        setAiNotice("No suggestion available for this theme — continue manually.");
        return;
      }
      applySuggestion(suggestion);
    } catch (cause) {
      // AI generation is non-deterministic — a malformed response is usually
      // fixed by asking again, so retry once, silently, before bothering the user.
      if (!isRetry) {
        await runAiSuggest(force, true);
        return;
      }
      setAiError(errorMessage(cause));
    }
  };

  const discardSuggestion = () => {
    if (!priorSnapshot) return;
    setTitle(priorSnapshot.title);
    setKeyResults(priorSnapshot.keyResults);
    setPriorSnapshot(null);
    setAppliedSnapshot(null);
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
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="okr-ai-theme-select"
                value={themeNodeId}
                onChange={(e) => setThemeNodeId(e.target.value)}
                disabled={nodes.isLoading || nodes.isError}
                className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 outline-none focus:border-indigo-500"
              >
                <option value="">
                  {nodes.isLoading ? "Loading themes…" : themes.length === 0 ? "No themes yet" : "Select a theme…"}
                </option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.nameEn}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid="okr-ai-suggest"
                onClick={() => void runAiSuggest()}
                disabled={!themeNodeId || generate.isPending}
                className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3.5 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {generate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI Suggest
              </button>
              {priorSnapshot && (
                <button
                  type="button"
                  data-testid="okr-ai-discard"
                  onClick={discardSuggestion}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Discard suggestion
                </button>
              )}
            </div>
            {confirmingRegenerate && (
              <div data-testid="okr-ai-confirm" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
                You&apos;ve edited the AI-filled fields. Replace them with a new suggestion?
                <button type="button" onClick={() => void runAiSuggest(true)} className="font-medium underline">
                  Replace
                </button>
                <button type="button" onClick={() => setConfirmingRegenerate(false)} className="font-medium underline">
                  Cancel
                </button>
              </div>
            )}
            {aiError && (
              <p data-testid="okr-ai-error" className="mt-2 text-sm text-red-600">
                {aiError}
              </p>
            )}
            {aiNotice && (
              <p data-testid="okr-ai-notice" className="mt-2 text-sm text-gray-500">
                {aiNotice}
              </p>
            )}
          </div>

          <Field label="Objective Name" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Drive Revenue Growth 40% YoY"
              className={inputClass}
            />
          </Field>

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
