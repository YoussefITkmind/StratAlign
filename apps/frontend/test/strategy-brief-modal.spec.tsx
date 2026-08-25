// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Behavioural tests for the Strategy Brief.
 *
 * The point of this screen is that nothing on it is invented: every theme
 * count, owner, and percentage rendered here must have come from the query.
 * These tests therefore assert on what the query returned, and — just as
 * importantly — that an absent owner or an unmeasured objective renders as an
 * explicit absence rather than as a plausible-looking zero.
 */

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  updateSection: vi.fn(),
  invalidate: vi.fn(),
  briefData: undefined as unknown,
  briefLoading: false,
  briefError: null as unknown,
  generatePending: false,
  generateError: null as unknown,
  updatePending: false,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ strategyBrief: { get: { invalidate: hooks.invalidate } } }),
    strategyBrief: {
      get: {
        useQuery: () => ({
          data: hooks.briefData,
          isLoading: hooks.briefLoading,
          isError: hooks.briefError !== null,
          error: hooks.briefError,
        }),
      },
      generate: {
        useMutation: () => ({
          mutateAsync: hooks.generate,
          isPending: hooks.generatePending,
          isError: hooks.generateError !== null,
          error: hooks.generateError,
        }),
      },
      updateSection: {
        useMutation: () => ({ mutateAsync: hooks.updateSection, isPending: hooks.updatePending }),
      },
    },
  },
}));

import StrategyBriefModal from "@/components/strategy/StrategyBriefModal";

const THEME_ID = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE_ID = "33333333-3333-4333-8333-333333333333";

const brief = {
  rootNodeId: "11111111-1111-4111-8111-111111111111",
  title: "Acme Corp 2025 Strategic Plan",
  generatedAt: "2026-08-25T10:00:00.000Z",
  executiveSummary: {
    content: "The plan spans 1 strategic theme and 1 measurable objective.",
    source: "ai" as const,
    aiContent: "The plan spans 1 strategic theme and 1 measurable objective.",
  },
  strategicVision: {
    content: "Sustainable value creation through focused execution.",
    source: "strategy" as const,
    aiContent: null,
  },
  strategicThemes: [{ id: THEME_ID, name: "Revenue & Growth", objectiveCount: 2 }],
  strategicObjectives: [
    {
      id: OBJECTIVE_ID,
      name: "Drive Revenue Growth 40% YoY",
      themeId: THEME_ID,
      themeName: "Revenue & Growth",
      owner: "Sarah Chen",
      progress: 67,
      health: "on-track" as const,
    },
  ],
  expectedOutcomes: ["Achieve measurable improvement in key financial metrics"],
  risks: [
    {
      severity: "medium" as const,
      area: "Revenue & Growth",
      title: "Revenue theme is at risk",
      mitigation: "Immediate executive review and resource reallocation required.",
    },
  ],
  insufficientData: false,
  insufficientDataReason: null,
  provider: "anthropic",
  model: "claude-sonnet-5",
};

function reset(): void {
  hooks.briefData = brief;
  hooks.briefLoading = false;
  hooks.briefError = null;
  hooks.generatePending = false;
  hooks.generateError = null;
  hooks.updatePending = false;
}

describe("StrategyBriefModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset();
  });

  afterEach(() => cleanup());

  describe("rendering the brief", () => {
    it("shows the strategy's real title, generated date, and the AI Generated label", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText("Acme Corp 2025 Strategic Plan")).toBeTruthy();
      expect(screen.getByText(/AI-generated strategy brief · 25 August 2026/)).toBeTruthy();
      expect(screen.getByTestId("ai-generated-badge").textContent).toContain("AI Generated");
    });

    it("renders the executive summary and the strategic vision", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(
        within(screen.getByTestId("brief-executive-summary")).getByText(
          "The plan spans 1 strategic theme and 1 measurable objective.",
        ),
      ).toBeTruthy();
      expect(
        within(screen.getByTestId("brief-strategic-vision")).getByText(
          "Sustainable value creation through focused execution.",
        ),
      ).toBeTruthy();
    });

    it("renders each theme with the objective count the backend computed", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      const themes = within(screen.getByTestId("brief-themes"));
      expect(themes.getByText("Revenue & Growth")).toBeTruthy();
      expect(themes.getByText("2 obj.")).toBeTruthy();
    });

    it("renders each objective with its owner and progress", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      const objective = within(screen.getByTestId(`brief-objective-${OBJECTIVE_ID}`));
      expect(objective.getByText("Drive Revenue Growth 40% YoY")).toBeTruthy();
      expect(objective.getByText("67%")).toBeTruthy();
      expect(objective.getByText("Owner: Sarah Chen")).toBeTruthy();
    });

    it("renders the expected outcomes and the risks with severity and area", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(
        within(screen.getByTestId("brief-outcomes")).getByText(
          "Achieve measurable improvement in key financial metrics",
        ),
      ).toBeTruthy();

      const risks = within(screen.getByTestId("brief-risks"));
      expect(risks.getByText("Medium")).toBeTruthy();
      expect(risks.getByText("Revenue theme is at risk")).toBeTruthy();
      expect(
        risks.getByText("Immediate executive review and resource reallocation required."),
      ).toBeTruthy();
    });

    it("carries a disclaimer that the analysis is AI-generated", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText(/AI-generated analysis based on current strategy data/)).toBeTruthy();
    });
  });

  describe("honest absences", () => {
    it("shows 'Not measured' instead of 0% for an objective with no progress data", () => {
      hooks.briefData = {
        ...brief,
        strategicObjectives: [{ ...brief.strategicObjectives[0], progress: null }],
      };
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      const objective = within(screen.getByTestId(`brief-objective-${OBJECTIVE_ID}`));
      expect(objective.getByText("Not measured")).toBeTruthy();
      expect(objective.queryByText("0%")).toBeNull();
    });

    it("shows 'Not assigned' instead of a name for an objective with no owner", () => {
      hooks.briefData = {
        ...brief,
        strategicObjectives: [{ ...brief.strategicObjectives[0], owner: null }],
      };
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText("Owner: Not assigned")).toBeTruthy();
    });

    it("says so plainly when no risks were identified", () => {
      hooks.briefData = { ...brief, risks: [] };
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByTestId("brief-no-risks").textContent).toContain(
        "No risks were identified",
      );
    });

    it("shows an empty-vision state rather than inventing one", () => {
      hooks.briefData = {
        ...brief,
        strategicVision: { content: null, source: "none" as const, aiContent: null },
      };
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(
        within(screen.getByTestId("brief-strategic-vision")).getByText(
          /no vision statement on record/,
        ),
      ).toBeTruthy();
    });
  });

  describe("generation", () => {
    it("offers to generate when no brief exists yet", async () => {
      hooks.briefData = null;
      hooks.generate.mockResolvedValue(brief);
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("generate-brief"));

      await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hooks.invalidate).toHaveBeenCalled());
    });

    it("shows a loading state while generating instead of freezing", () => {
      hooks.generatePending = true;
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByTestId("brief-generating").textContent).toContain(
        "Generating strategy brief…",
      );
    });

    it("regenerates from the latest data when asked", async () => {
      hooks.generate.mockResolvedValue(brief);
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("regenerate-brief"));

      await waitFor(() => expect(hooks.generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hooks.invalidate).toHaveBeenCalled());
    });

    it("shows a useful message when generation fails", () => {
      hooks.generateError = new Error("The AI service is unavailable right now. Try again later.");
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText(/The AI service is unavailable right now/)).toBeTruthy();
    });

    it("shows a loading state while the brief is being fetched", () => {
      hooks.briefLoading = true;
      hooks.briefData = undefined;
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText(/Loading strategy brief…/)).toBeTruthy();
    });

    it("shows an error state when the brief cannot be loaded", () => {
      hooks.briefData = undefined;
      hooks.briefError = new Error("That strategy could not be found.");
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      expect(screen.getByText("That strategy could not be found.")).toBeTruthy();
    });
  });

  describe("insufficient data", () => {
    it("explains that the strategy cannot support a reliable brief yet", () => {
      hooks.briefData = {
        ...brief,
        insufficientData: true,
        insufficientDataReason: "This strategy has no objectives yet.",
        strategicObjectives: [],
        expectedOutcomes: [],
        risks: [],
      };
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      const banner = screen.getByTestId("brief-insufficient-data");
      expect(banner.textContent).toContain("isn't enough strategy data");
      expect(banner.textContent).toContain("This strategy has no objectives yet.");
    });
  });

  describe("editing", () => {
    it("saves an edited executive summary through the mutation", async () => {
      hooks.updateSection.mockResolvedValue(brief);
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("brief-executive-summary-edit"));
      fireEvent.change(screen.getByTestId("brief-executive-summary-input"), {
        target: { value: "An executive rewrote this summary." },
      });
      fireEvent.click(screen.getByTestId("brief-executive-summary-save"));

      await waitFor(() => expect(hooks.updateSection).toHaveBeenCalledTimes(1));
      expect(hooks.updateSection).toHaveBeenCalledWith({
        section: "executiveSummary",
        content: "An executive rewrote this summary.",
      });
      await waitFor(() => expect(hooks.invalidate).toHaveBeenCalled());
    });

    it("edits the strategic vision through its own section", async () => {
      hooks.updateSection.mockResolvedValue(brief);
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("brief-strategic-vision-edit"));
      fireEvent.change(screen.getByTestId("brief-strategic-vision-input"), {
        target: { value: "A revised vision statement." },
      });
      fireEvent.click(screen.getByTestId("brief-strategic-vision-save"));

      await waitFor(() =>
        expect(hooks.updateSection).toHaveBeenCalledWith({
          section: "strategicVision",
          content: "A revised vision statement.",
        }),
      );
    });

    it("restores the previous value on cancel without saving", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("brief-executive-summary-edit"));
      fireEvent.change(screen.getByTestId("brief-executive-summary-input"), {
        target: { value: "A draft that should be discarded." },
      });
      fireEvent.click(screen.getByTestId("brief-executive-summary-cancel"));

      expect(hooks.updateSection).not.toHaveBeenCalled();
      expect(screen.queryByTestId("brief-executive-summary-input")).toBeNull();
      expect(
        screen.getByText("The plan spans 1 strategic theme and 1 measurable objective."),
      ).toBeTruthy();
    });

    it("refuses to save an empty section", () => {
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("brief-executive-summary-edit"));
      fireEvent.change(screen.getByTestId("brief-executive-summary-input"), {
        target: { value: "   " },
      });

      const save = screen.getByTestId("brief-executive-summary-save") as HTMLButtonElement;
      expect(save.disabled).toBe(true);
      fireEvent.click(save);
      expect(hooks.updateSection).not.toHaveBeenCalled();
    });

    it("marks an edited section and offers a route back to the AI version", async () => {
      hooks.briefData = {
        ...brief,
        executiveSummary: {
          content: "An executive rewrote this.",
          source: "user" as const,
          aiContent: "The model's original summary.",
        },
      };
      hooks.updateSection.mockResolvedValue(brief);
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      const section = within(screen.getByTestId("brief-executive-summary"));
      expect(section.getByText("Edited")).toBeTruthy();

      fireEvent.click(screen.getByTestId("brief-executive-summary-revert"));

      await waitFor(() =>
        expect(hooks.updateSection).toHaveBeenCalledWith({
          section: "executiveSummary",
          content: null,
        }),
      );
    });

    it("surfaces a save failure without losing the editor", async () => {
      hooks.updateSection.mockRejectedValue(new Error("Generate the strategy brief before editing it."));
      render(<StrategyBriefModal canManage onClose={() => {}} />);

      fireEvent.click(screen.getByTestId("brief-executive-summary-edit"));
      fireEvent.change(screen.getByTestId("brief-executive-summary-input"), {
        target: { value: "A rewrite." },
      });
      fireEvent.click(screen.getByTestId("brief-executive-summary-save"));

      expect(
        await screen.findByText("Generate the strategy brief before editing it."),
      ).toBeTruthy();
      expect(screen.getByTestId("brief-executive-summary-input")).toBeTruthy();
    });
  });

  describe("authorization in the UI", () => {
    it("hides edit, regenerate, and generate from a user who cannot manage strategy", () => {
      render(<StrategyBriefModal canManage={false} onClose={() => {}} />);

      expect(screen.queryByTestId("brief-executive-summary-edit")).toBeNull();
      expect(screen.queryByTestId("brief-strategic-vision-edit")).toBeNull();
      expect(screen.queryByTestId("regenerate-brief")).toBeNull();
    });

    it("still lets that user read the brief", () => {
      render(<StrategyBriefModal canManage={false} onClose={() => {}} />);

      expect(screen.getByText("Drive Revenue Growth 40% YoY")).toBeTruthy();
    });

    it("tells a read-only user who to ask when no brief exists", () => {
      hooks.briefData = null;
      render(<StrategyBriefModal canManage={false} onClose={() => {}} />);

      expect(screen.queryByTestId("generate-brief")).toBeNull();
      expect(screen.getByText(/Ask a strategy administrator/)).toBeTruthy();
    });
  });

  it("closes when the close control is used", () => {
    const onClose = vi.fn();
    render(<StrategyBriefModal canManage onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close strategy brief"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
