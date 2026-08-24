// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  createDraft: vi.fn(),
  nodes: vi.fn(),
  me: vi.fn(),
  state: {
    generatePending: false,
    createPending: false,
    createError: null as { message: string } | null,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ registry: { kpi: { list: { invalidate: vi.fn() } } } }),
    auth: { me: { useQuery: () => hooks.me() } },
    strategy: { nodes: { useQuery: () => hooks.nodes() } },
    aiSuggestion: {
      generate: {
        useMutation: () => ({
          mutateAsync: hooks.generate,
          isPending: hooks.state.generatePending,
        }),
      },
    },
    registry: {
      kpi: {
        createDraft: {
          useMutation: () => ({
            mutate: hooks.createDraft,
            isPending: hooks.state.createPending,
            error: hooks.state.createError,
          }),
        },
      },
    },
  },
}));

import CreateKpiModal from "@/components/kpi-workspace/CreateKpiModal";

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "44444444-4444-4444-8444-444444444444";

function kpiSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestionId: SUGGESTION_ID,
    generationId: GENERATION_ID,
    themeNodeId: THEME_ID,
    themeNameEn: "Revenue & Growth",
    kind: "kpi" as const,
    titleEn: "LTV to CAC Ratio",
    titleAr: "نسبة",
    descriptionEn: "Acquisition efficiency.",
    descriptionAr: null,
    confidence: 0.91,
    rationale: null,
    kpi: {
      unit: "x",
      frequency: "quarterly" as const,
      polarity: "higher_is_better" as const,
    },
    okr: null,
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
  fireEvent.change(screen.getByTestId("kpi-ai-theme-select"), { target: { value: THEME_ID } });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.generatePending = false;
  hooks.state.createPending = false;
  hooks.state.createError = null;
  hooks.nodes.mockReturnValue({
    data: [{ id: THEME_ID, type: "theme", state: "active", nameEn: "Revenue & Growth" }],
  });
  hooks.me.mockReturnValue({ data: { id: USER_ID, email: "member@example.test", name: "Member" } });
  hooks.generate.mockResolvedValue(batch([kpiSuggestion()]));
});

afterEach(() => cleanup());

describe("CreateKpiModal AI Suggest", () => {
  it("keeps the AI Suggest button disabled until a theme is picked", () => {
    render(<CreateKpiModal onClose={() => {}} />);
    expect((screen.getByTestId("kpi-ai-suggest") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("fills Name, Description, and Frequency, but leaves Unit/Polarity untouched", async () => {
    render(<CreateKpiModal onClose={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(hooks.generate).toHaveBeenCalledWith({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 5 });

    expect(await screen.findByDisplayValue("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.getByDisplayValue("Acquisition efficiency.")).toBeTruthy();
    expect(screen.getByDisplayValue("Quarterly")).toBeTruthy();

    expect((screen.getByPlaceholderText("e.g. %") as HTMLInputElement).value).toBe("");
  });

  it("does not overwrite a Name the user already typed", async () => {
    render(<CreateKpiModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Revenue Growth (YoY)"), { target: { value: "My Own KPI Name" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("Acquisition efficiency.")).toBeTruthy();
    expect(screen.getByDisplayValue("My Own KPI Name")).toBeTruthy();
  });

  it("discard suggestion restores the fields to what they were before", async () => {
    render(<CreateKpiModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("Describe this KPI..."), { target: { value: "Original description" } });
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("Acquisition efficiency.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("kpi-ai-discard"));

    expect(screen.getByDisplayValue("Original description")).toBeTruthy();
    expect(screen.queryByTestId("kpi-ai-discard")).toBeNull();
  });

  it("warns before replacing a hand-edited suggestion, and only overwrites after confirming", async () => {
    render(<CreateKpiModal onClose={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
    await screen.findByDisplayValue("Acquisition efficiency.");

    fireEvent.change(screen.getByDisplayValue("Acquisition efficiency."), { target: { value: "hand edited" } });

    hooks.generate.mockResolvedValue(batch([kpiSuggestion({ descriptionEn: "Second suggestion." })]));
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    expect(await screen.findByTestId("kpi-ai-confirm")).toBeTruthy();
    expect(hooks.generate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Replace"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(2));
    expect(await screen.findByDisplayValue("Second suggestion.")).toBeTruthy();
  });

  it("shows an inline error only after a retry also fails", async () => {
    hooks.generate.mockRejectedValue(new Error("AI provider unavailable"));
    render(<CreateKpiModal onClose={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    expect((await screen.findByTestId("kpi-ai-error")).textContent).toContain("AI provider unavailable");
    expect((screen.getByPlaceholderText("e.g. Revenue Growth (YoY)") as HTMLInputElement).value).toBe("");
    expect(hooks.generate).toHaveBeenCalledTimes(2);
  });

  it("silently retries once and applies the suggestion if the retry succeeds", async () => {
    hooks.generate
      .mockRejectedValueOnce(new Error("The AI response could not be used. Try generating suggestions again."))
      .mockResolvedValueOnce(batch([kpiSuggestion()]));
    render(<CreateKpiModal onClose={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    expect(await screen.findByDisplayValue("LTV to CAC Ratio")).toBeTruthy();
    expect(hooks.generate).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("kpi-ai-error")).toBeNull();
  });

  it("shows a notice instead of an error when there is no suggestion for the theme", async () => {
    hooks.generate.mockResolvedValue(batch([]));
    render(<CreateKpiModal onClose={() => {}} />);
    selectTheme();
    fireEvent.click(screen.getByTestId("kpi-ai-suggest"));

    expect((await screen.findByTestId("kpi-ai-notice")).textContent).toContain("No suggestion available");
    expect(screen.queryByTestId("kpi-ai-error")).toBeNull();
  });

  it("submits the real registry mutation with the current user as owner", () => {
    render(<CreateKpiModal onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("e.g. Revenue Growth (YoY)"), { target: { value: "Revenue Growth" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. نمو الإيرادات"), { target: { value: "نمو الإيرادات" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. %"), { target: { value: "%" } });

    fireEvent.click(screen.getByRole("button", { name: "Create KPI" }));

    expect(hooks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        nameEn: "Revenue Growth",
        nameAr: "نمو الإيرادات",
        unit: "%",
        ownerUserId: USER_ID,
        dataSourceType: "manual",
      }),
    );
  });

  it("shows the mutation's error message when creation fails", () => {
    hooks.state.createError = { message: "You do not have permission to create KPIs." };
    render(<CreateKpiModal onClose={() => {}} />);
    expect(screen.getByTestId("kpi-create-error").textContent).toContain("You do not have permission");
  });
});
