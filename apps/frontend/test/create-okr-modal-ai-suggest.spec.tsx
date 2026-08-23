// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  nodes: vi.fn(),
  state: {
    generatePending: false,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    strategy: { nodes: { useQuery: () => hooks.nodes() } },
    aiSuggestion: {
      generate: {
        useMutation: () => ({
          mutateAsync: hooks.generate,
          isPending: hooks.state.generatePending,
        }),
      },
    },
  },
}));

import CreateOkrModal from "@/components/kpi-workspace/CreateOkrModal";

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
const OBJECTIVE_ID = "44444444-4444-4444-8444-444444444444";

function okrSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestionId: SUGGESTION_ID,
    generationId: GENERATION_ID,
    themeNodeId: THEME_ID,
    themeNameEn: "Revenue & Growth",
    kind: "okr" as const,
    titleEn: "Expand into enterprise accounts",
    titleAr: "توسيع",
    descriptionEn: "Grow the enterprise segment.",
    descriptionAr: null,
    confidence: 0.72,
    rationale: null,
    kpi: null,
    okr: {
      objectiveNodeId: OBJECTIVE_ID,
      keyResults: [
        { titleEn: "Sign 20 enterprise logos", titleAr: "توقيع", type: "quantitative" as const, targetValue: 20, unit: "logos" },
        { titleEn: "Reach $5M enterprise ARR", titleAr: "الوصول", type: "quantitative" as const, targetValue: 5, unit: "M USD" },
      ],
    },
    duplicateMatches: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
}

function batch(suggestions: unknown[]) {
  return {
    generationId: GENERATION_ID,
    themeNodeId: THEME_ID,
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 1200,
    suggestions,
  };
}

function selectTheme() {
  fireEvent.change(screen.getByTestId("okr-ai-theme-select"), { target: { value: THEME_ID } });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.generatePending = false;
  hooks.nodes.mockReturnValue({
    data: [{ id: THEME_ID, type: "theme", state: "active", nameEn: "Revenue & Growth" }],
  });
  hooks.generate.mockResolvedValue(batch([okrSuggestion()]));
});

afterEach(() => cleanup());

describe("CreateOkrModal AI Suggest", () => {
  it("keeps the AI Suggest button disabled until a theme is picked", () => {
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    expect((screen.getByTestId("okr-ai-suggest") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("fills Title and replaces Key Results with the suggested ones", async () => {
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(hooks.generate).toHaveBeenCalledWith({ themeNodeId: THEME_ID, kinds: ["okr"], maxSuggestions: 1 });

    expect(await screen.findByDisplayValue("Expand into enterprise accounts")).toBeTruthy();
    expect(screen.getByDisplayValue("Sign 20 enterprise logos")).toBeTruthy();
    expect(screen.getByDisplayValue("Reach $5M enterprise ARR")).toBeTruthy();
    expect(screen.getByDisplayValue("20 logos")).toBeTruthy();
    expect(screen.getByDisplayValue("5 M USD")).toBeTruthy();

    const actualInputs = screen.getAllByPlaceholderText("Actual") as HTMLInputElement[];
    expect(actualInputs.every((input) => input.value === "")).toBe(true);
    const dueDateInputs = screen.getAllByPlaceholderText("Due date") as HTMLInputElement[];
    expect(dueDateInputs.every((input) => input.value === "")).toBe(true);
  });

  it("does not overwrite a Title the user already typed", async () => {
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Drive Revenue Growth 40% YoY"), { target: { value: "My Own Objective" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("Sign 20 enterprise logos")).toBeTruthy();
    expect(screen.getByDisplayValue("My Own Objective")).toBeTruthy();
  });

  it("discard suggestion restores Title and Key Results to what they were before", async () => {
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(`e.g. Achieve $48M ARR by Dec 2025`), { target: { value: "Hand-entered KR" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("Sign 20 enterprise logos")).toBeTruthy();

    fireEvent.click(screen.getByTestId("okr-ai-discard"));

    expect(screen.getByDisplayValue("Hand-entered KR")).toBeTruthy();
    expect(screen.queryByDisplayValue("Sign 20 enterprise logos")).toBeNull();
    expect(screen.queryByTestId("okr-ai-discard")).toBeNull();
  });

  it("warns before replacing hand-edited key results, and only overwrites after confirming", async () => {
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    await screen.findByDisplayValue("Sign 20 enterprise logos");

    fireEvent.change(screen.getByDisplayValue("Sign 20 enterprise logos"), { target: { value: "hand edited KR" } });

    hooks.generate.mockResolvedValue(
      batch([
        okrSuggestion({
          okr: { objectiveNodeId: OBJECTIVE_ID, keyResults: [{ titleEn: "Second suggestion KR", titleAr: "x", type: "quantitative", targetValue: 1, unit: "unit" }] },
        }),
      ]),
    );
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    expect(await screen.findByTestId("okr-ai-confirm")).toBeTruthy();
    expect(hooks.generate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Replace"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue("Second suggestion KR")).toBeTruthy();
  });

  it("shows an inline error only after a retry also fails", async () => {
    hooks.generate.mockRejectedValue(new Error("AI provider unavailable"));
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    expect((await screen.findByTestId("okr-ai-error")).textContent).toContain("AI provider unavailable");
    expect((screen.getByPlaceholderText("e.g. Drive Revenue Growth 40% YoY") as HTMLInputElement).value).toBe("");
    expect(hooks.generate).toHaveBeenCalledTimes(2);
  });

  it("silently retries once and applies the suggestion if the retry succeeds", async () => {
    hooks.generate
      .mockRejectedValueOnce(new Error("The AI response could not be used. Try generating suggestions again."))
      .mockResolvedValueOnce(batch([okrSuggestion()]));
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    expect(await screen.findByDisplayValue("Expand into enterprise accounts")).toBeTruthy();
    expect(hooks.generate).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("okr-ai-error")).toBeNull();
  });

  it("shows a notice instead of an error when there is no suggestion, and leaves existing key results alone", async () => {
    hooks.generate.mockResolvedValue(batch([]));
    render(<CreateOkrModal onClose={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(`e.g. Achieve $48M ARR by Dec 2025`), { target: { value: "Untouched KR" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("okr-ai-suggest"));

    expect((await screen.findByTestId("okr-ai-notice")).textContent).toContain("No suggestion available");
    expect(screen.queryByTestId("okr-ai-error")).toBeNull();
    expect(screen.getByDisplayValue("Untouched KR")).toBeTruthy();
  });
});
