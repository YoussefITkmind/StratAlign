"use client";

import { useState, type ReactNode } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

type Frequency = "monthly" | "quarterly";
type Polarity = "higher_is_better" | "lower_is_better";

const FREQUENCY_LABEL: Record<Frequency, string> = { monthly: "Monthly", quarterly: "Quarterly" };
const POLARITY_LABEL: Record<Polarity, string> = {
  higher_is_better: "Higher is better",
  lower_is_better: "Lower is better",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not generate a suggestion.";
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateKpiModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [unit, setUnit] = useState("");
  const [polarity, setPolarity] = useState<Polarity>("higher_is_better");
  const [freq, setFreq] = useState<Frequency>("monthly");
  const [activeFrom, setActiveFrom] = useState(todayIsoDate());
  const [description, setDescription] = useState("");

  const [themeNodeId, setThemeNodeId] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  type AiFields = { name: string; description: string; freq: Frequency };
  /** Snapshot of the AI-touched fields right before the last suggestion was applied. */
  const [priorSnapshot, setPriorSnapshot] = useState<AiFields | null>(null);
  /** Snapshot of the AI-touched fields exactly as applied — used to detect hand-edits. */
  const [appliedSnapshot, setAppliedSnapshot] = useState<AiFields | null>(null);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const me = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();
  const nodes = trpc.strategy.nodes.useQuery();
  const themes = (nodes.data ?? []).filter((node) => node.type === "theme" && node.state !== "retired");
  const generate = trpc.aiSuggestion.generate.useMutation();
  const createDraft = trpc.registry.kpi.createDraft.useMutation({
    onSuccess: () => {
      void utils.registry.kpi.list.invalidate();
      onClose();
    },
  });

  const hasHandEdited =
    appliedSnapshot !== null &&
    (name !== appliedSnapshot.name || description !== appliedSnapshot.description || freq !== appliedSnapshot.freq);

  const valid =
    name.trim().length > 0 && nameAr.trim().length > 0 && unit.trim().length > 0 && activeFrom.trim().length > 0;

  const applySuggestion = (suggestion: {
    titleEn: string;
    descriptionEn: string | null;
    kpi: { frequency: Frequency } | null;
  }) => {
    setPriorSnapshot({ name, description, freq });
    const nextName = name.trim().length > 0 ? name : suggestion.titleEn;
    const nextDescription = suggestion.descriptionEn ?? description;
    const nextFreq: Frequency = suggestion.kpi?.frequency ?? freq;
    setName(nextName);
    setDescription(nextDescription);
    setFreq(nextFreq);
    setAppliedSnapshot({ name: nextName, description: nextDescription, freq: nextFreq });
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
      // Ask for a small pool, not just one: the backend only returns suggestions
      // that pass its own applicability checks, so requesting a single candidate
      // makes "nothing came back usable" far likelier than it needs to be.
      const result = await generate.mutateAsync({ themeNodeId, kinds: ["kpi"], maxSuggestions: 5 });
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
    setName(priorSnapshot.name);
    setDescription(priorSnapshot.description);
    setFreq(priorSnapshot.freq);
    setPriorSnapshot(null);
    setAppliedSnapshot(null);
    setAiNotice(null);
    setAiError(null);
  };

  const handleCreate = () => {
    if (!valid || !me.data) return;
    createDraft.mutate({
      nameEn: name.trim(),
      nameAr: nameAr.trim(),
      unit: unit.trim(),
      polarity,
      frequency: freq,
      dataSourceType: "manual",
      ownerUserId: me.data.id,
      activeFrom: new Date(activeFrom),
      descriptionEn: description.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-kpi-title" className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 id="create-kpi-title" className="text-lg font-semibold text-gray-900">Create KPI</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="app-scroll flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="kpi-ai-theme-select"
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
                data-testid="kpi-ai-suggest"
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
                  data-testid="kpi-ai-discard"
                  onClick={discardSuggestion}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Discard suggestion
                </button>
              )}
            </div>
            {confirmingRegenerate && (
              <div data-testid="kpi-ai-confirm" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
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
              <p data-testid="kpi-ai-error" className="mt-2 text-sm text-red-600">
                {aiError}
              </p>
            )}
            {aiNotice && (
              <p data-testid="kpi-ai-notice" className="mt-2 text-sm text-gray-500">
                {aiNotice}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="KPI Name (English)" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Revenue Growth (YoY)"
                className={inputClass}
              />
            </Field>
            <Field label="KPI Name (Arabic)" required>
              <input
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="e.g. نمو الإيرادات"
                dir="rtl"
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Unit" required>
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. %" className={inputClass} />
            </Field>
            <Field label="Polarity" required>
              <select value={polarity} onChange={(e) => setPolarity(e.target.value as Polarity)} className={inputClass}>
                {(Object.keys(POLARITY_LABEL) as Polarity[]).map((key) => (
                  <option key={key} value={key}>{POLARITY_LABEL[key]}</option>
                ))}
              </select>
            </Field>
            <Field label="Frequency" required>
              <select value={freq} onChange={(e) => setFreq(e.target.value as Frequency)} className={inputClass}>
                {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((key) => (
                  <option key={key} value={key}>{FREQUENCY_LABEL[key]}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Active From" required>
            <input
              type="date"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this KPI..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </Field>

          {createDraft.error && (
            <p data-testid="kpi-create-error" className="text-sm text-red-600">
              {createDraft.error.message}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            disabled={!valid || createDraft.isPending}
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {createDraft.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create KPI
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
