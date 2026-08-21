// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Task 4: AI Suggest inside the individual KPI creation flow.
 *
 * Reuses the same tRPC hooks Task 3's AiSuggestModal uses
 * (`strategy.nodes.useQuery`, `aiSuggestion.generate.useMutation`) — mocked the
 * same way here — but this modal is not AiSuggestModal: there is no batch
 * review, no accept/reject. A single suggestion is written directly into the
 * form's own controlled fields, and `onCreate` (the pre-existing local/mock
 * creation callback) always reads whatever is currently in the form.
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

import CreateKpiModal from "@/components/kpi-workspace/CreateKpiModal";

const THEME_ID = "11111111-1111-4111-8111-111111111111";

function payloadOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call][0] as Record<string, unknown>;
}

function kpiBatch(overrides: Record<string, unknown> = {}) {
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
        kind: "kpi" as const,
        titleEn: "LTV to CAC Ratio",
        titleAr: "نسبة",
        descriptionEn: "Acquisition efficiency.",
        descriptionAr: null,
        confidence: 0.9,
        rationale: null,
        kpi: {
          unit: "x",
          frequency: "quarterly" as const,
          polarity: "higher_is_better" as const,
          perspective: "financial" as const,
          targetValue: 4,
        },
        okr: null,
        duplicateMatches: [],
        ...overrides,
      },
    ],
  };
}

function selectTheme() {
  fireEvent.change(screen.getByTestId("kpi-ai-theme-select"), { target: { value: THEME_ID } });
}

function nameInput() {
  return screen.getByPlaceholderText("e.g. Revenue Growth (YoY)");
}

function descriptionInput() {
  return screen.getByPlaceholderText("Describe this KPI...");
}

function targetInput() {
  return screen.getByPlaceholderText("e.g. 40%");
}

function frequencySelect() {
  return screen.getByLabelText("Frequency");
}

function value(el: HTMLElement): string {
  return (el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
}

function pressed(el: HTMLElement): boolean {
  return el.getAttribute("aria-pressed") === "true";
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.generatePending = false;
  hooks.nodes.mockReturnValue({
    data: [{ id: THEME_ID, type: "theme", state: "active", nameEn: "Revenue & Growth" }],
  });
  hooks.generate.mockResolvedValue(kpiBatch());
});

afterEach(() => cleanup());

describe("CreateKpiModal — AI Suggest", () => {
  it("renders an AI Suggest button inside the KPI creation form", () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByTestId("ai-suggest-kpi")).not.toBeNull();
  });

  it("requires a theme to be selected before generating", () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    const button = screen.getByTestId("ai-suggest-kpi") as HTMLButtonElement;

    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it('sends kind=["kpi"] and maxSuggestions=1 for the selected theme', async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate)).toMatchObject({
      themeNodeId: THEME_ID,
      kinds: ["kpi"],
      maxSuggestions: 1,
    });
  });

  it("sends the user's already-typed name as userIntent", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Something about churn" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate).userIntent).toBe("Something about churn");
  });

  it("omits userIntent when nothing has been typed yet", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate).userIntent).toBeUndefined();
  });

  it("populates description, perspective, target, and frequency from the suggestion", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await screen.findByText(/AI Suggested/);
    expect(value(descriptionInput())).toBe("Acquisition efficiency.");
    expect(value(targetInput())).toBe("4 x");
    expect(value(frequencySelect())).toBe("Quarterly");
    expect(pressed(screen.getByRole("button", { name: "Financial" }))).toBe(true);
  });

  it("fills the empty name field from the suggestion's title", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await screen.findByText(/AI Suggested/);
    expect(value(nameInput())).toBe("LTV to CAC Ratio");
  });

  it("preserves a manually entered name instead of overwriting it", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "My Own KPI Name" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await screen.findByText(/AI Suggested/);
    expect(value(nameInput())).toBe("My Own KPI Name");
  });

  it("lets the user edit every AI-populated field normally", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(targetInput(), { target: { value: "99 units" } });
    fireEvent.change(descriptionInput(), { target: { value: "My edited description" } });

    expect(value(targetInput())).toBe("99 units");
    expect(value(descriptionInput())).toBe("My edited description");
  });

  it("discards only the AI-populated fields, keeping a manually entered name", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Kept Name" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    await screen.findByText(/AI Suggested/);

    fireEvent.click(screen.getByTestId("discard-ai-suggestion-kpi"));

    expect(value(nameInput())).toBe("Kept Name");
    expect(value(descriptionInput())).toBe("");
    expect(value(targetInput())).toBe("");
    expect(value(frequencySelect())).toBe("Monthly");
    expect(pressed(screen.getByRole("button", { name: "Financial" }))).toBe(true);
    expect(screen.queryByTestId("discard-ai-suggestion-kpi")).toBeNull();
  });

  it("uses the edited values, not the original suggestion, on Create", async () => {
    const onCreate = vi.fn();
    render(<CreateKpiModal onClose={vi.fn()} onCreate={onCreate} />);
    fireEvent.change(nameInput(), { target: { value: "Edited Create Flow" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(targetInput(), { target: { value: "77%" } });
    fireEvent.click(screen.getByRole("button", { name: "Customer" }));

    fireEvent.click(screen.getByRole("button", { name: "Create KPI" }));

    expect(onCreate).toHaveBeenCalledOnce();
    const created = onCreate.mock.calls[0][0];
    expect(created.target).toBe("77%");
    expect(created.perspective).toBe("customer");
    expect(created.description).toBe("Acquisition efficiency.");
  });

  it("leaves manual creation usable when generation fails", async () => {
    hooks.generate.mockRejectedValue(new Error("The model is unavailable"));
    const onCreate = vi.fn();
    render(<CreateKpiModal onClose={vi.fn()} onCreate={onCreate} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await screen.findByText("The model is unavailable");

    fireEvent.change(nameInput(), { target: { value: "Manually Typed KPI" } });
    fireEvent.click(screen.getByRole("button", { name: "Create KPI" }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0][0].name).toBe("Manually Typed KPI");
  });

  it("handles zero suggestions without crashing and keeps the form usable", async () => {
    hooks.generate.mockResolvedValue({ ...kpiBatch(), suggestions: [] });
    const onCreate = vi.fn();
    render(<CreateKpiModal onClose={vi.fn()} onCreate={onCreate} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await screen.findByText(/didn't have a suggestion/i);
    expect(screen.queryByTestId("discard-ai-suggestion-kpi")).toBeNull();

    fireEvent.change(nameInput(), { target: { value: "Still Manual" } });
    fireEvent.click(screen.getByRole("button", { name: "Create KPI" }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("asks for confirmation before regenerating over edited AI values", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    await screen.findByText(/AI Suggested/);

    fireEvent.change(descriptionInput(), { target: { value: "I changed this myself" } });

    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    expect(hooks.generate).toHaveBeenCalledOnce();
    expect(screen.getByTestId("confirm-regenerate-kpi")).not.toBeNull();

    hooks.generate.mockResolvedValue(kpiBatch({ descriptionEn: "A brand new suggestion" }));
    fireEvent.click(screen.getByTestId("confirm-regenerate-kpi"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(value(descriptionInput())).toBe("A brand new suggestion"));
  });

  it("regenerates without a confirmation prompt when nothing was edited", async () => {
    render(<CreateKpiModal onClose={vi.fn()} onCreate={vi.fn()} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));
    await screen.findByText(/AI Suggested/);

    fireEvent.click(screen.getByTestId("ai-suggest-kpi"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("confirm-regenerate-kpi")).toBeNull();
  });
});
