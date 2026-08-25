"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

/**
 * The Audio Brief action on the Overview page.
 *
 * The audio arrives as base64 in the mutation response rather than as a URL:
 * the brief is generated per request from the viewer's own data and is never
 * stored, so there is nothing to serve from. It is turned into an object URL
 * here and revoked when it is replaced or the card unmounts — without that,
 * each regeneration would leak the previous clip for the life of the tab.
 */

interface AudioBriefData {
  title: string;
  script: string;
  insufficientData: boolean;
  audio: { base64: string; contentType: string; format: "mp3" };
}

function toObjectUrl(base64: string, contentType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}

export function AudioBriefCard() {
  const [brief, setBrief] = useState<AudioBriefData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    audioUrlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  const generate = trpc.audioBrief.generate.useMutation();

  const run = async () => {
    setError(null);
    try {
      const result = (await generate.mutateAsync({})) as AudioBriefData;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      setBrief(result);
      setAudioUrl(toObjectUrl(result.audio.base64, result.audio.contentType));
    } catch (failure) {
      setBrief(null);
      setAudioUrl(null);
      setError(failure instanceof Error ? failure.message : "Unable to generate the audio brief");
    }
  };

  const isPending = generate.isPending;

  return (
    <section
      data-testid="audio-brief-card"
      className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Audio Brief</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            A short spoken summary of what needs your attention right now.
          </p>
        </div>
        <button
          type="button"
          data-testid="audio-brief-generate"
          onClick={() => { void run(); }}
          disabled={isPending}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isPending ? "Generating…" : brief || error ? "Regenerate" : "Generate Audio Brief"}
        </button>
      </div>

      {isPending && (
        <p data-testid="audio-brief-loading" className="mt-3 text-xs text-gray-500">
          Gathering your current performance data and preparing the briefing…
        </p>
      )}

      {error && !isPending && (
        <div className="mt-3 rounded-lg bg-red-50 p-3">
          <p role="alert" data-testid="audio-brief-error" className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            data-testid="audio-brief-retry"
            onClick={() => { void run(); }}
            className="mt-2 text-xs font-medium text-red-700 underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {brief && !isPending && !error && (
        <div data-testid="audio-brief-result" className="mt-3">
          <p className="text-[13px] font-medium text-gray-800">{brief.title}</p>
          {audioUrl && (
            <audio
              data-testid="audio-brief-player"
              controls
              src={audioUrl}
              className="mt-2 w-full"
            >
              <track kind="captions" />
            </audio>
          )}
          <p data-testid="audio-brief-script" className="mt-2 text-xs leading-relaxed text-gray-500">
            {brief.script}
          </p>
          <p className="mt-2 text-[10px] text-gray-400">
            AI-generated from your current KPI, objective, and initiative data.
          </p>
        </div>
      )}
    </section>
  );
}
