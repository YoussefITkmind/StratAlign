// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Behavioural tests for the Overview page's Audio Brief action.
 *
 * tRPC is mocked at the client module so the hook behaves like a real mutation
 * hook — including `isPending`, which is what disables the button and drives
 * the loading copy.
 */

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  state: { pending: false },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    audioBrief: {
      generate: {
        useMutation: () => ({
          mutateAsync: hooks.generate,
          isPending: hooks.state.pending,
        }),
      },
    },
  },
}));

import { AudioBriefCard } from "@/components/home/AudioBriefCard";

const result = {
  title: "Executive Brief",
  script: "Revenue Growth is off track at forty percent against a target of one hundred.",
  insufficientData: false,
  audio: {
    base64: Buffer.from("fake-mp3-bytes").toString("base64"),
    contentType: "audio/mpeg",
    format: "mp3" as const,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.pending = false;
  hooks.generate.mockResolvedValue(result);
  // happy-dom does not implement object URLs; the component only needs a
  // stable string back and a revoke it can call.
  URL.createObjectURL = vi.fn(() => "blob:audio-brief");
  URL.revokeObjectURL = vi.fn();
});

afterEach(cleanup);

describe("AudioBriefCard", () => {
  it("renders the generate action before anything has been generated", () => {
    render(<AudioBriefCard />);

    expect(screen.getByTestId("audio-brief-generate").textContent).toBe("Generate Audio Brief");
    expect(screen.queryByTestId("audio-brief-result")).toBeNull();
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("shows a loading state and disables the button while generating", () => {
    hooks.state.pending = true;
    render(<AudioBriefCard />);

    expect(screen.getByTestId("audio-brief-loading")).toBeTruthy();
    expect((screen.getByTestId("audio-brief-generate") as HTMLButtonElement).disabled).toBe(true);
  });

  it("plays the returned audio and shows the script once generation succeeds", async () => {
    render(<AudioBriefCard />);

    fireEvent.click(screen.getByTestId("audio-brief-generate"));

    await waitFor(() => expect(screen.getByTestId("audio-brief-result")).toBeTruthy());
    expect(hooks.generate).toHaveBeenCalledWith({});
    const player = screen.getByTestId("audio-brief-player") as HTMLAudioElement;
    expect(player.getAttribute("src")).toBe("blob:audio-brief");
    expect(player.hasAttribute("controls")).toBe(true);
    expect(screen.getByTestId("audio-brief-script").textContent).toBe(result.script);
    expect(screen.getByText("Executive Brief")).toBeTruthy();
  });

  it("surfaces a failure message and offers a retry", async () => {
    hooks.generate.mockRejectedValue(new Error("The audio brief is unavailable right now."));
    render(<AudioBriefCard />);

    fireEvent.click(screen.getByTestId("audio-brief-generate"));

    await waitFor(() => expect(screen.getByTestId("audio-brief-error")).toBeTruthy());
    expect(screen.getByTestId("audio-brief-error").textContent).toBe(
      "The audio brief is unavailable right now.",
    );
    expect(screen.queryByTestId("audio-brief-player")).toBeNull();
    expect(screen.getByTestId("audio-brief-retry")).toBeTruthy();
  });

  it("clears the error and renders the player when a retry succeeds", async () => {
    hooks.generate.mockRejectedValueOnce(new Error("Temporary failure"));
    render(<AudioBriefCard />);

    fireEvent.click(screen.getByTestId("audio-brief-generate"));
    await waitFor(() => expect(screen.getByTestId("audio-brief-retry")).toBeTruthy());

    fireEvent.click(screen.getByTestId("audio-brief-retry"));

    await waitFor(() => expect(screen.getByTestId("audio-brief-player")).toBeTruthy());
    expect(screen.queryByTestId("audio-brief-error")).toBeNull();
    expect(hooks.generate).toHaveBeenCalledTimes(2);
  });

  it("revokes the previous clip before replacing it, so regeneration does not leak", async () => {
    render(<AudioBriefCard />);

    fireEvent.click(screen.getByTestId("audio-brief-generate"));
    await waitFor(() => expect(screen.getByTestId("audio-brief-player")).toBeTruthy());

    fireEvent.click(screen.getByTestId("audio-brief-generate"));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audio-brief"));
  });
});
