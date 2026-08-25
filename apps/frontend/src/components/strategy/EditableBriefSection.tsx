"use client";

import { useState } from "react";
import { Loader2, Pencil, RotateCcw, Sparkles } from "lucide-react";

/** Mirrors the backend's `BriefSection` — see strategy-brief.types.ts. */
export interface BriefSectionValue {
  content: string | null;
  source: "ai" | "user" | "strategy" | "none";
  aiContent: string | null;
}

interface Props {
  title: string;
  section: BriefSectionValue;
  /** Shown in place of the content when the section is empty. */
  emptyLabel: string;
  canEdit: boolean;
  isSaving: boolean;
  /** `null` reverts the section to the AI-generated text. */
  onSave: (content: string | null) => Promise<void>;
  testId: string;
}

const MAX_LENGTH = 2_000;

/**
 * One editable section of the Strategy Brief.
 *
 * Editing is deliberately explicit: the displayed text is never a live-bound
 * input, so a half-typed draft cannot be mistaken for saved content. Cancel
 * discards the draft and restores what was there; Save is refused while the
 * draft is empty, because an empty executive summary is not a valid edit.
 *
 * A section sourced from the user is labelled as such rather than as AI
 * output, and keeps a route back to the model's own wording — the two are
 * distinguishable at a glance, not just in the database.
 */
export default function EditableBriefSection({
  title,
  section,
  emptyLabel,
  canEdit,
  isSaving,
  onSave,
  testId,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEditing = () => {
    setDraft(section.content ?? "");
    setError(null);
    setIsEditing(true);
  };

  const cancel = () => {
    // The draft is thrown away rather than kept, so reopening the editor
    // always starts from what is actually saved.
    setDraft("");
    setError(null);
    setIsEditing(false);
  };

  const commit = async (content: string | null) => {
    setError(null);
    try {
      await onSave(content);
      setIsEditing(false);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save this section.");
    }
  };

  const trimmed = draft.trim();
  const isEdited = section.source === "user";
  const canRevert = isEdited && section.aiContent !== null;

  return (
    <section data-testid={testId} className="border-t border-gray-100 px-6 py-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
          {isEdited && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              Edited
            </span>
          )}
        </div>

        {canEdit && !isEditing && (
          <div className="flex items-center gap-3">
            {canRevert && (
              <button
                type="button"
                data-testid={`${testId}-revert`}
                onClick={() => void commit(null)}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" /> Revert to AI version
              </button>
            )}
            <button
              type="button"
              data-testid={`${testId}-edit`}
              onClick={startEditing}
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div>
          <textarea
            data-testid={`${testId}-input`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            maxLength={MAX_LENGTH}
            aria-label={`${title} content`}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-400">
              {trimmed.length === 0 ? "This section can't be empty." : `${draft.length}/${MAX_LENGTH}`}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid={`${testId}-cancel`}
                onClick={cancel}
                className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid={`${testId}-save`}
                onClick={() => void commit(trimmed)}
                disabled={trimmed.length === 0 || isSaving}
                className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      ) : section.content ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {section.content}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm italic text-gray-400">
          <Sparkles className="h-3.5 w-3.5" /> {emptyLabel}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </section>
  );
}
