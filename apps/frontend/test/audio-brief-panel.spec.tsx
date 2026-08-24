// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * Behavioural tests for the "Generate Audio Brief" action on the Executive
 * Overview: it renders, it triggers generation, it shows a loading state,
 * it prevents a duplicate request while one is in flight, it shows the
 * audio player on success, and it shows a retryable error on failure.
 *
 * tRPC is mocked at the client module so the mutation hook behaves like a
 * real one, including `isPending`, which is what disables the button.
 */

const hooks = vi.hoisted(() => ({
  mutate: vi.fn(),
  state: {
    isPending: false,
    isError: false,
    error: null as { message: string } | null,
    data: undefined as unknown,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    audioBrief: {
      generate: {
        useMutation: () => ({
          mutate: hooks.mutate,
          isPending: hooks.state.isPending,
          isError: hooks.state.isError,
          error: hooks.state.error,
          data: hooks.state.data,
        }),
      },
    },
  },
}));

import { AudioBriefPanel } from "@/components/home/AudioBriefPanel";

const briefResult = {
  title: "Executive Audio Brief",
  script: "Here is your executive briefing. Revenue Growth is currently off track.",
  items: [
    { type: "kpi", name: "Revenue Growth", importance: "critical", reason: "18 percent below target." },
  ],
  audioBase64: "ZmFrZS1tcDMtYnl0ZXM=",
  audioMimeType: "audio/mpeg",
  provider: "openai",
  model: "gpt-4o-mini",
  ttsProvider: "openai",
  ttsModel: "tts-1",
  latencyMs: 812,
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.isPending = false;
  hooks.state.isError = false;
  hooks.state.error = null;
  hooks.state.data = undefined;
});

afterEach(cleanup);

describe("AudioBriefPanel", () => {
  it("renders the Generate Audio Brief button", () => {
    render(<AudioBriefPanel />);

    expect(screen.getByTestId("audio-brief-generate-button")).toBeTruthy();
  });

  it("triggers generation when clicked", () => {
    render(<AudioBriefPanel />);

    fireEvent.click(screen.getByTestId("audio-brief-generate-button"));

    expect(hooks.mutate).toHaveBeenCalledWith({});
  });

  it("shows a loading state while generation is in flight", () => {
    hooks.state.isPending = true;
    render(<AudioBriefPanel />);

    expect(screen.getByText("Generating…")).toBeTruthy();
    expect((screen.getByTestId("audio-brief-generate-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("prevents a duplicate request while one is already in flight", () => {
    hooks.state.isPending = true;
    render(<AudioBriefPanel />);

    fireEvent.click(screen.getByTestId("audio-brief-generate-button"));

    expect(hooks.mutate).not.toHaveBeenCalled();
  });

  it("shows the audio player after successful generation", () => {
    hooks.state.data = briefResult;
    render(<AudioBriefPanel />);

    const result = screen.getByTestId("audio-brief-result");
    const player = within(result).getByTestId("audio-brief-player") as HTMLAudioElement;
    expect(player).toBeTruthy();
    expect(player.src).toBe(`data:audio/mpeg;base64,${briefResult.audioBase64}`);
    expect(within(result).getByText("Executive Audio Brief")).toBeTruthy();
    expect(within(result).getByText("Revenue Growth")).toBeTruthy();
  });

  it("shows an error state after a failed generation", () => {
    hooks.state.isError = true;
    hooks.state.error = { message: "Unable to generate the audio brief. Please try again." };
    render(<AudioBriefPanel />);

    expect(screen.getByTestId("audio-brief-error")).toBeTruthy();
    expect(screen.getByText("Unable to generate the audio brief. Please try again.")).toBeTruthy();
  });

  it("retries generation from the error state", () => {
    hooks.state.isError = true;
    hooks.state.error = { message: "Unable to generate the audio brief. Please try again." };
    render(<AudioBriefPanel />);

    fireEvent.click(screen.getByText("Retry"));

    expect(hooks.mutate).toHaveBeenCalledWith({});
  });

  it("does not render a result or error before the reviewer has generated anything", () => {
    render(<AudioBriefPanel />);

    expect(screen.queryByTestId("audio-brief-result")).toBeNull();
    expect(screen.queryByTestId("audio-brief-error")).toBeNull();
  });
});
