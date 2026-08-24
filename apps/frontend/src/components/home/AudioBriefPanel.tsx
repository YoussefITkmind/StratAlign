"use client";

import { Headphones, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

const IMPORTANCE_BADGE: Record<string, string> = {
  critical: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  positive: "bg-emerald-50 text-emerald-700",
};

/**
 * "Generate Audio Brief" action for the Executive Overview.
 *
 * The mutation itself is the duplicate-request guard: `useMutation`'s
 * `isPending` covers a request already in flight, and the button is disabled
 * while it is true, so a second click before the first response lands is a
 * no-op rather than a second generation.
 */
export function AudioBriefPanel() {
  const mutation = trpc.audioBrief.generate.useMutation();

  const handleGenerate = () => {
    if (mutation.isPending) return;
    mutation.mutate({});
  };

  const audioSrc = mutation.data
    ? `data:${mutation.data.audioMimeType};base64,${mutation.data.audioBase64}`
    : null;

  return (
    <section
      data-testid="audio-brief-panel"
      className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Headphones className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Executive Audio Brief</h2>
            <p className="text-xs text-gray-500">
              A short spoken summary of what needs your attention right now.
            </p>
          </div>
        </div>
        <button
          type="button"
          data-testid="audio-brief-generate-button"
          onClick={handleGenerate}
          disabled={mutation.isPending}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>🎧 Generate Audio Brief</>
          )}
        </button>
      </div>

      {mutation.isError && (
        <div
          role="alert"
          data-testid="audio-brief-error"
          className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {mutation.error.message || "Unable to generate the audio brief. Please try again."}
          </span>
          <button
            type="button"
            onClick={handleGenerate}
            className="flex shrink-0 items-center gap-1 rounded-full border border-red-300 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-100"
          >
            <RotateCcw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {mutation.data && audioSrc && (
        <div data-testid="audio-brief-result" className="mt-3 space-y-2.5">
          <p className="text-sm font-medium text-gray-800">{mutation.data.title}</p>
          <audio
            data-testid="audio-brief-player"
            controls
            src={audioSrc}
            className="w-full"
          >
            Your browser does not support audio playback.
          </audio>
          {mutation.data.items.length > 0 && (
            <ul className="space-y-1.5">
              {mutation.data.items.map((item, index) => (
                <li
                  key={`${item.type}-${item.name}-${index}`}
                  className="flex items-start justify-between gap-2 text-xs text-gray-600"
                >
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${IMPORTANCE_BADGE[item.importance] ?? "bg-gray-100 text-gray-600"}`}
                  >
                    {item.importance}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
