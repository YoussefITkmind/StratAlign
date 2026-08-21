// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Task 4: AI Suggest inside the individual OKR creation flow.
 *
 * Same reuse contract as create-kpi-modal-ai-suggest.spec.tsx: the same
 * generate mutation, the same theme-selector pattern, but this modal (not
 * AiSuggestModal) writes a single suggestion straight into its own controlled
 * fields.
 */

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  nodes: vi.fn(),
  state: { generatePending: false },
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
const OBJECTIVE_ID = "22222222-2222-4222-8222-222222222222";

function payloadOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call][0] as Record<string, unknown>;
}

function okrBatch(overrides: Record<string, unknown> = {}) {
  return {
    generationId: "gen-1",
    themeNodeId: THEME_ID,
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 500,
    suggestions: [
      {
        suggestionId: "sugg-1",
        generationId: "gen-1",
        themeNodeId: THEME_ID,
        themeNameEn: "Revenue & Growth",
        kind: "okr" as const,
        titleEn: "Expand into enterprise accounts",
        titleAr: "التوسع",
        descriptionEn: null,
        descriptionAr: null,
        confidence: 0.75,
        rationale: null,
        kpi: null,
        okr: {
          objectiveNodeId: OBJECTIVE_ID,
          keyResults: [
            { titleEn: "Sign 20 enterprise logos", titleAr: "توقيع", type: "quantitative" as const, targetValue: 20, unit: "logos" },
          ],
        },
        duplicateMatches: [],
        ...overrides,
      },
    ],
  };
}

function selectTheme() {
  fireEvent.change(screen.getByTestId("okr-ai-theme-select"), { target: { value: THEME_ID } });
}

function titleInput() {
  return screen.getByPlaceholderText("e.g. Drive Revenue Growth 40% YoY");
}

function keyResultLabelInputs() {
  return screen.getAllByPlaceholderText("e.g. Achieve $48M ARR by Dec 2025");
}

function value(el: HTMLElement): string {
  return (el as HTMLInputElement | HTMLSelectElement).value;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.generatePending = false;
  hooks.nodes.mockReturnValue({
    data: [{ id: THEME_ID, type: "theme", state: "active", nameEn: "Revenue & Growth" }],
  });
  hooks.generate.mockResolvedValue(okrBatch());
});

afterEach(() => cleanup());

describe("CreateOkrModal — AI Suggest", () => {
  it("renders an AI Suggest button inside the OKR creation form", () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByTestId("ai-suggest-okr")).not.toBeNull();
  });

  it('sends kind=["okr"] and maxSuggestions=1 for the selected theme', async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate)).toMatchObject({
      themeNodeId: THEME_ID,
      kinds: ["okr"],
      maxSuggestions: 1,
    });
  });

  it("sends the user's already-typed objective name as userIntent", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(titleInput(), { target: { value: "Something about enterprise growth" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate).userIntent).toBe("Something about enterprise growth");
  });

  it("populates the empty objective title and key results from the suggestion", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await screen.findByText(/AI Suggested/);
    expect(value(titleInput())).toBe("Expand into enterprise accounts");
    const labels = keyResultLabelInputs();
    expect(labels).toHaveLength(1);
    expect(value(labels[0])).toBe("Sign 20 enterprise logos");
  });

  it("retains the suggested objectiveNodeId internally without a user-facing selector", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await screen.findByText(/AI Suggested/);
    expect(screen.queryByRole("combobox", { name: /objective/i })).toBeNull();
    expect(value(screen.getByTestId("ai-objective-node-id"))).toBe(OBJECTIVE_ID);
  });

  it("preserves a manually entered objective title instead of overwriting it", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(titleInput(), { target: { value: "My Own Objective" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await screen.findByText(/AI Suggested/);
    expect(value(titleInput())).toBe("My Own Objective");
  });

  it("lets the user edit AI-populated key results normally", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(keyResultLabelInputs()[0], { target: { value: "My edited key result" } });
    expect(value(keyResultLabelInputs()[0])).toBe("My edited key result");
  });

  it("discards the AI-populated key results, keeping a manually entered title", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(titleInput(), { target: { value: "Kept Objective" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));
    await screen.findByText(/AI Suggested/);

    fireEvent.click(screen.getByTestId("discard-ai-suggestion-okr"));

    expect(value(titleInput())).toBe("Kept Objective");
    expect(keyResultLabelInputs()).toHaveLength(1);
    expect(value(keyResultLabelInputs()[0])).toBe("");
    expect(value(screen.getByTestId("ai-objective-node-id"))).toBe("");
  });

  it("uses the edited values, not the original suggestion, on Create", async () => {
    const onCreate = vi.fn();
    render(<CreateOkrModal onClose={vi.fn()} onCreate={onCreate} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(keyResultLabelInputs()[0], { target: { value: "Edited key result" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Objective" }));

    expect(onCreate).toHaveBeenCalledOnce();
    const created = onCreate.mock.calls[0][0];
    expect(created.title).toBe("Expand into enterprise accounts");
    expect(created.keyResults[0].label).toBe("Edited key result");
  });

  it("leaves manual creation usable when generation fails", async () => {
    hooks.generate.mockRejectedValue(new Error("The model is unavailable"));
    const onCreate = vi.fn();
    render(<CreateOkrModal onClose={vi.fn()} onCreate={onCreate} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await screen.findByText("The model is unavailable");

    fireEvent.change(titleInput(), { target: { value: "Manually Typed Objective" } });
    fireEvent.change(keyResultLabelInputs()[0], { target: { value: "Manual key result" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Objective" }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0][0].title).toBe("Manually Typed Objective");
  });

  it("handles zero suggestions without crashing and keeps the form usable", async () => {
    hooks.generate.mockResolvedValue({ ...okrBatch(), suggestions: [] });
    const onCreate = vi.fn();
    render(<CreateOkrModal onClose={vi.fn()} onCreate={onCreate} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));

    await screen.findByText(/didn't have a suggestion/i);

    fireEvent.change(titleInput(), { target: { value: "Still Manual Objective" } });
    fireEvent.change(keyResultLabelInputs()[0], { target: { value: "Still manual KR" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Objective" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before regenerating over edited key results", async () => {
    render(<CreateOkrModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-okr"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(keyResultLabelInputs()[0], { target: { value: "I changed this myself" } });

    fireEvent.click(screen.getByTestId("ai-suggest-okr"));
    expect(hooks.generate).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-regenerate-okr")).not.toBeNull();

    hooks.generate.mockResolvedValue(
      okrBatch({ titleEn: "A brand new objective suggestion" }),
    );
    fireEvent.click(screen.getByTestId("confirm-regenerate-okr"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(2));
  });
});
