"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Sparkles, X } from "lucide-react";
import { PERSPECTIVE_META } from "./KpiLibraryTable";
import type { KpiLibraryRow, KpiPerspective } from "@/data/mockKpiLibrary";
import { trpc } from "@/lib/trpc/client";

const PERSPECTIVES: KpiPerspective[] = ["financial", "customer", "internal", "learning"];

type KpiFrequency = "Weekly" | "Monthly" | "Quarterly";

/** The subset of a generated KPI suggestion this modal knows how to apply. */
type GeneratedKpiFields = {
  description: string;
  perspective: KpiPerspective;
  target: string;
  freq: KpiFrequency;
  /** The value AI wrote into the name field, or `null` if the name was
   * already non-empty and so was left untouched. */
  name: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

function mapAiFrequency(frequency: "monthly" | "quarterly"): KpiFrequency {
  return frequency === "monthly" ? "Monthly" : "Quarterly";
}

function formatAiTarget(targetValue: number, unit: string): string {
  const trimmedUnit = unit.trim();
  return trimmedUnit ? `${targetValue} ${trimmedUnit}` : String(targetValue);
}

const OWNER_COLOR_CYCLE = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-violet-600"];

function initialsOf(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}

export default function CreateKpiModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (row: KpiLibraryRow) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [perspective, setPerspective] = useState<KpiPerspective>("financial");
  const [actual, setActual] = useState("");
  const [target, setTarget] = useState("");
  const [freq, setFreq] = useState<"Weekly" | "Monthly" | "Quarterly">("Monthly");
  const [ownerName, setOwnerName] = useState("");
  const [description, setDescription] = useState("");

  const [themeNodeId, setThemeNodeId] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  /** Values right before the current suggestion was applied — restored on discard. */
  const [priorAiFields, setPriorAiFields] = useState<GeneratedKpiFields | null>(null);
  /** Values the current suggestion actually set — used to detect edits. */
  const [appliedAiFields, setAppliedAiFields] = useState<GeneratedKpiFields | null>(null);
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
    (description !== appliedAiFields.description ||
      perspective !== appliedAiFields.perspective ||
      target !== appliedAiFields.target ||
      freq !== appliedAiFields.freq ||
      (appliedAiFields.name !== null && name !== appliedAiFields.name));

  const valid = name.trim().length > 0;

  const applySuggestion = (
    kpi: { perspective: KpiPerspective; targetValue: number; unit: string; frequency: "monthly" | "quarterly" },
    titleEn: string,
    descriptionEn: string | null,
  ) => {
    const nameIsEmpty = name.trim().length === 0;
    const prior: GeneratedKpiFields = {
      description, perspective, target, freq,
      name: nameIsEmpty ? name : null,
    };
    const applied: GeneratedKpiFields = {
      description: descriptionEn ?? "",
      perspective: kpi.perspective,
      target: formatAiTarget(kpi.targetValue, kpi.unit),
      freq: mapAiFrequency(kpi.frequency),
      name: nameIsEmpty ? titleEn : null,
    };

    setDescription(applied.description);
    setPerspective(applied.perspective);
    setTarget(applied.target);
    setFreq(applied.freq);
    if (applied.name !== null) setName(applied.name);

    setPriorAiFields(prior);
    setAppliedAiFields(applied);
  };

  const runGenerate = async () => {
    setAiError(null);
    setAiNotice(null);
    try {
      const result = await generate.mutateAsync({
        themeNodeId,
        kinds: ["kpi"],
        maxSuggestions: 1,
        userIntent: name.trim() || undefined,
      });
      const suggestion = result.suggestions[0];
      if (!suggestion || !suggestion.kpi) {
        setAiNotice("The AI didn't have a suggestion for this theme. You can continue filling the form manually.");
        return;
      }
      applySuggestion(suggestion.kpi, suggestion.titleEn, suggestion.descriptionEn);
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
    setDescription(priorAiFields.description);
    setPerspective(priorAiFields.perspective);
    setTarget(priorAiFields.target);
    setFreq(priorAiFields.freq);
    if (priorAiFields.name !== null) setName(priorAiFields.name);
    setPriorAiFields(null);
    setAppliedAiFields(null);
    setAiNotice(null);
    setAiError(null);
  };

  const handleCreate = () => {
    if (!valid) return;
    const owner = ownerName.trim();
    onCreate({
      id: `kpi-custom-${Date.now()}`,
      name: name.trim(),
      tag: category.trim() || "General",
      perspective,
      department: department.trim() || "Unassigned",
      owner: {
        initials: initialsOf(owner || "New Owner"),
        name: owner || "Unassigned",
        color: OWNER_COLOR_CYCLE[Math.abs(hashCode(name.trim())) % OWNER_COLOR_CYCLE.length],
      },
      actual: actual.trim() || "—",
      target: target.trim() || "—",
      variance: "—",
      favorable: true,
      trend: [0, 0, 0, 0, 0, 0],
      freq,
      approval: "draft",
      status: "on-track",
      description: description.trim() || undefined,
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
          <Field label="KPI Name" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revenue Growth (YoY)"
              className={inputClass}
            />
          </Field>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <select
                  data-testid="kpi-ai-theme-select"
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
                data-testid="ai-suggest-kpi"
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
                  data-testid="discard-ai-suggestion-kpi"
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
                  data-testid="confirm-regenerate-kpi"
                  onClick={confirmRegenerate}
                  className="rounded-lg bg-amber-600 px-2.5 py-1 font-medium text-white hover:bg-amber-700"
                >
                  Replace
                </button>
                <button
                  type="button"
                  data-testid="cancel-regenerate-kpi"
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Revenue" className={inputClass} />
            </Field>
            <Field label="Department">
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Sales" className={inputClass} />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-gray-700">
              BSC Perspective <span className="text-red-500">*</span>
            </span>
            <div role="group" aria-label="BSC Perspective" className="grid grid-cols-4 gap-2">
              {PERSPECTIVES.map((key) => {
                const meta = PERSPECTIVE_META[key];
                const Icon = meta.icon;
                const active = perspective === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPerspective(key)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition ${
                      active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Actual Value">
              <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="e.g. 38%" className={inputClass} />
            </Field>
            <Field label="Target Value">
              <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 40%" className={inputClass} />
            </Field>
            <Field label="Frequency">
              <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)} className={inputClass}>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
              </select>
            </Field>
          </div>

          <Field label="Owner Name">
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Sarah Chen" className={inputClass} />
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
