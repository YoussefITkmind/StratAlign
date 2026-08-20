// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Behavioural tests for the AI Suggest review experience.
 *
 * These assert the payload that reaches the mutation, not just that elements
 * appear. The duplicate-confirmation rule in particular is a security boundary:
 * the backend refuses an unacknowledged near-duplicate, and the only way that
 * guard stays meaningful is if this component never sends
 * `acknowledgeDuplicate: true` on the reviewer's behalf.
 *
 * tRPC is mocked at the client module so the hooks behave like real mutation
 * hooks — including `isPending`, which is what disables the buttons.
 */

const hooks = vi.hoisted(() => ({
  generate: vi.fn(),
  accept: vi.fn(),
  acceptMany: vi.fn(),
  nodes: vi.fn(),
  state: {
    generatePending: false,
    acceptPending: false,
    acceptManyPending: false,
    generateData: undefined as unknown,
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
          data: hooks.state.generateData,
        }),
      },
      accept: {
        useMutation: () => ({
          mutateAsync: hooks.accept,
          isPending: hooks.state.acceptPending,
        }),
      },
      acceptMany: {
        useMutation: () => ({
          mutateAsync: hooks.acceptMany,
          isPending: hooks.state.acceptManyPending,
        }),
      },
    },
  },
}));

import AiSuggestModal from "@/components/kpi-workspace/AiSuggestModal";

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_THEME_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";
const CLEAN_ID = "33333333-3333-4333-8333-333333333333";
const STRONG_DUP_ID = "44444444-4444-4444-8444-444444444444";
const WEAK_DUP_ID = "55555555-5555-4555-8555-555555555555";
const OKR_ID = "66666666-6666-4666-8666-666666666666";
const OBJECTIVE_ID = "77777777-7777-4777-8777-777777777777";

function kpiSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestionId: CLEAN_ID,
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

function okrSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    ...kpiSuggestion(),
    suggestionId: OKR_ID,
    kind: "okr" as const,
    titleEn: "Expand into enterprise accounts",
    confidence: 0.62,
    kpi: null,
    okr: {
      objectiveNodeId: OBJECTIVE_ID,
      keyResults: [
        {
          titleEn: "Sign 20 enterprise logos",
          titleAr: "توقيع",
          type: "quantitative" as const,
          targetValue: 20,
          unit: "logos",
        },
      ],
    },
    ...overrides,
  };
}

const strongDuplicate = kpiSuggestion({
  suggestionId: STRONG_DUP_ID,
  titleEn: "Customer Retention Rate",
  duplicateMatches: [
    {
      kpiDefinitionId: "existing-kpi",
      okrId: null,
      nameEn: "Customer Retention Rate",
      similarity: 0.95,
    },
  ],
});

const weakDuplicate = kpiSuggestion({
  suggestionId: WEAK_DUP_ID,
  titleEn: "Acquisition Cost",
  duplicateMatches: [
    {
      kpiDefinitionId: "existing-other",
      okrId: null,
      nameEn: "Cost per Acquisition",
      similarity: 0.55,
    },
  ],
});

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

/**
 * Renders with a generation already returned, as after a successful Generate.
 *
 * `initialTypeFilter="all"` because the component's own default is "kpi"
 * (origin/main's call-site contract) and most of these cases assert across both
 * kinds. Tests that care about the default set it explicitly.
 */
function renderWithBatch(suggestions: unknown[], props: Record<string, unknown> = {}) {
  hooks.state.generateData = batch(suggestions);
  return render(<AiSuggestModal onClose={() => {}} initialTypeFilter="all" {...props} />);
}

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled;
}

function payloadOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call][0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.generatePending = false;
  hooks.state.acceptPending = false;
  hooks.state.acceptManyPending = false;
  hooks.state.generateData = undefined;
  hooks.nodes.mockReturnValue({
    data: [
      { id: THEME_ID, type: "theme", state: "active", nameEn: "Revenue & Growth" },
      { id: OTHER_THEME_ID, type: "theme", state: "active", nameEn: "Customer Experience" },
      { id: OBJECTIVE_ID, type: "objective", state: "active", nameEn: "Achieve $60M ARR" },
      { id: "retired-theme", type: "theme", state: "retired", nameEn: "Sunset Theme" },
    ],
  });
  hooks.generate.mockResolvedValue(batch([]));
  hooks.accept.mockResolvedValue({
    suggestionId: CLEAN_ID,
    subjectType: "kpi_definition",
    subjectId: "created-kpi",
    alreadyAccepted: false,
    edited: false,
  });
  hooks.acceptMany.mockResolvedValue({ accepted: [], failed: [] });
});

afterEach(() => cleanup());

describe("AiSuggestModal — theme selection and generation", () => {
  it("offers only live themes, never objectives or retired nodes", () => {
    render(<AiSuggestModal onClose={() => {}} />);
    const select = screen.getByTestId("theme-select");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);

    expect(options).toContain("Revenue & Growth");
    expect(options).toContain("Customer Experience");
    expect(options).not.toContain("Achieve $60M ARR");
    expect(options).not.toContain("Sunset Theme");
  });

  it("cannot generate until a theme is chosen", () => {
    render(<AiSuggestModal onClose={() => {}} />);
    const generate = screen.getByTestId("generate");

    expect(isDisabled(generate)).toBe(true);
    fireEvent.click(generate);
    expect(hooks.generate).not.toHaveBeenCalled();
  });

  it("generates for the selected theme with the active kind filter", async () => {
    render(<AiSuggestModal onClose={() => {}} initialTypeFilter="all" />);
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: THEME_ID } });
    fireEvent.click(screen.getByRole("button", { name: "KPI" }));
    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate)).toEqual({
      themeNodeId: THEME_ID,
      kinds: ["kpi"],
      maxSuggestions: 8,
    });
  });

  it("shows a loading state and blocks a second generate while in flight", () => {
    hooks.state.generatePending = true;
    render(<AiSuggestModal onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: THEME_ID } });

    expect(screen.getByText(/Generating suggestions for this theme/i)).toBeTruthy();
    expect(isDisabled(screen.getByTestId("generate"))).toBe(true);
  });

  it("surfaces a generation failure without leaving a stale loading state", async () => {
    hooks.generate.mockRejectedValue(new Error("AI suggestions are unavailable right now."));
    render(<AiSuggestModal onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: THEME_ID } });
    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() =>
      expect(screen.getByText("AI suggestions are unavailable right now.")).toBeTruthy(),
    );
  });

  it("reports an empty generation distinctly from an exhausted list", () => {
    renderWithBatch([]);
    expect(screen.getByText(/nothing new to propose for this theme/i)).toBeTruthy();
  });
});

describe("AiSuggestModal — rendering suggestions", () => {
  it("renders each suggestion with its kind, confidence, and AI provenance badge", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);

    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();

    // "KPI"/"OKR" also label the filter tabs, so read the kind badge from
    // inside each suggestion's own card.
    const kpiCard = screen.getByText("LTV to CAC Ratio").closest("div.rounded-xl") as HTMLElement;
    const okrCard = screen
      .getByText("Expand into enterprise accounts")
      .closest("div.rounded-xl") as HTMLElement;
    expect(within(kpiCard).getByText("KPI")).toBeTruthy();
    expect(within(okrCard).getByText("OKR")).toBeTruthy();
    // 0.91 and 0.62 rendered as whole percentages, not raw floats.
    expect(screen.getByText("91%")).toBeTruthy();
    expect(screen.getByText("62%")).toBeTruthy();
    expect(screen.queryByText("0.91")).toBeNull();
    expect(screen.getAllByText("AI Suggested")).toHaveLength(2);
  });

  it("labels confidence as an AI estimate rather than a guarantee", () => {
    renderWithBatch([kpiSuggestion()]);
    const label = screen.getByTitle(/estimate produced by the model, not a guarantee/i);
    expect(label.textContent).toContain("AI confidence");
  });

  it("shows key results with their targets for an OKR suggestion", () => {
    renderWithBatch([okrSuggestion()]);
    expect(screen.getByText(/Sign 20 enterprise logos/)).toBeTruthy();
    expect(screen.getByText(/20 logos/)).toBeTruthy();
  });
});

describe("AiSuggestModal — accept", () => {
  it("sends the generated values and marks the item resolved", async () => {
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.accept)).toMatchObject({
      suggestionId: CLEAN_ID,
      generationId: GENERATION_ID,
      themeNodeId: THEME_ID,
      kind: "kpi",
      titleEn: "LTV to CAC Ratio",
      provider: "anthropic",
      model: "claude-sonnet-5",
      edited: false,
    });

    await waitFor(() => expect(screen.queryByText("LTV to CAC Ratio")).toBeNull());
    expect(screen.getByText(/Created as a draft KPI/)).toBeTruthy();
  });

  it("reports an already-accepted result instead of claiming a new record", async () => {
    hooks.accept.mockResolvedValue({
      suggestionId: CLEAN_ID,
      subjectType: "kpi_definition",
      subjectId: "created-kpi",
      alreadyAccepted: true,
      edited: false,
    });
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() =>
      expect(screen.getByText(/had already been accepted — nothing was created twice/i)).toBeTruthy(),
    );
  });

  it("disables every action while an accept is in flight", () => {
    hooks.state.acceptPending = true;
    renderWithBatch([kpiSuggestion()]);

    expect(isDisabled(screen.getByTestId(`accept-${CLEAN_ID}`))).toBe(true);
    expect(isDisabled(screen.getByTestId(`edit-${CLEAN_ID}`))).toBe(true);
    expect(isDisabled(screen.getByTestId(`reject-${CLEAN_ID}`))).toBe(true);
    expect(isDisabled(screen.getByTestId("accept-all"))).toBe(true);
  });

  it("does not issue a mutation from repeated clicks while one is in flight", () => {
    // `busy` is what protects against double submission. With a mutation
    // pending, every action control carries the disabled attribute, and a
    // click on a disabled button never reaches the handler.
    hooks.state.acceptPending = true;
    renderWithBatch([kpiSuggestion()]);
    const button = screen.getByTestId(`accept-${CLEAN_ID}`);

    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    expect(hooks.accept).not.toHaveBeenCalled();
  });

  it("issues exactly one mutation for a single accept", async () => {
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());

    // Once resolved the suggestion leaves the list, so it cannot be re-sent.
    await waitFor(() => expect(screen.queryByText("LTV to CAC Ratio")).toBeNull());
    expect(screen.queryByTestId(`accept-${CLEAN_ID}`)).toBeNull();
    expect(hooks.accept).toHaveBeenCalledTimes(1);
  });

  it("surfaces an acceptance failure and leaves the suggestion listed", async () => {
    hooks.accept.mockRejectedValue(new Error("Unable to accept this suggestion"));
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() =>
      expect(screen.getByText("Unable to accept this suggestion")).toBeTruthy(),
    );
    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
  });
});

describe("AiSuggestModal — edit", () => {
  it("sends the edited values and keeps the item flagged as AI-originated", async () => {
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`edit-${CLEAN_ID}`));

    fireEvent.change(screen.getByLabelText("Title (English)"), {
      target: { value: "Increase enterprise ARR by 30%" },
    });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "%" } });
    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "monthly" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));

    expect(screen.getByText("Increase enterprise ARR by 30%")).toBeTruthy();
    expect(screen.getByText("Edited")).toBeTruthy();
    // Provenance is not lost by editing.
    expect(screen.getByText("AI Suggested")).toBeTruthy();

    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.accept)).toMatchObject({
      titleEn: "Increase enterprise ARR by 30%",
      edited: true,
      kpi: { unit: "%", frequency: "monthly", polarity: "higher_is_better" },
    });
  });

  it("sends edited key-result targets for an OKR", async () => {
    renderWithBatch([okrSuggestion()]);
    fireEvent.click(screen.getByTestId(`edit-${OKR_ID}`));

    fireEvent.change(screen.getByLabelText("Target for Sign 20 enterprise logos"), {
      target: { value: "35" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save edits" }));
    fireEvent.click(screen.getByTestId(`accept-${OKR_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    const payload = payloadOf(hooks.accept);
    expect((payload.okr as { keyResults: Array<{ targetValue: number }> }).keyResults[0].targetValue)
      .toBe(35);
    expect(payload.edited).toBe(true);
  });

  it("discards an edit that is cancelled", () => {
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`edit-${CLEAN_ID}`));
    fireEvent.change(screen.getByLabelText("Title (English)"), {
      target: { value: "Never saved" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.queryByText("Never saved")).toBeNull();
    expect(screen.queryByText("Edited")).toBeNull();
  });
});

describe("AiSuggestModal — reject", () => {
  it("removes the item locally and never calls the backend", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);
    fireEvent.click(screen.getByTestId(`reject-${CLEAN_ID}`));

    expect(screen.queryByText("LTV to CAC Ratio")).toBeNull();
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
    expect(hooks.accept).not.toHaveBeenCalled();
    expect(hooks.acceptMany).not.toHaveBeenCalled();
  });

  it("excludes a rejected item from a later Accept all", async () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);
    fireEvent.click(screen.getByTestId(`reject-${CLEAN_ID}`));
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() => expect(hooks.acceptMany).toHaveBeenCalledOnce());
    const sent = payloadOf(hooks.acceptMany).suggestions as Array<{ suggestionId: string }>;
    expect(sent.map((item) => item.suggestionId)).toEqual([OKR_ID]);
  });
});

describe("AiSuggestModal — duplicate confirmation", () => {
  it("sends acknowledgeDuplicate=false for a clean suggestion", async () => {
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId(`accept-${CLEAN_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.accept).acknowledgeDuplicate).toBe(false);
  });

  it("shows the warning but still accepts a weak match without confirmation", async () => {
    renderWithBatch([weakDuplicate]);

    expect(screen.getByTestId(`duplicate-warning-${WEAK_DUP_ID}`)).toBeTruthy();
    expect(screen.getByText(/Possible existing item/)).toBeTruthy();

    fireEvent.click(screen.getByTestId(`accept-${WEAK_DUP_ID}`));

    // Below the server's blocking floor, so no confirmation is demanded — but
    // consent is still not implied.
    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.accept).acknowledgeDuplicate).toBe(false);
  });

  it("does NOT accept a strong duplicate on the first click", () => {
    renderWithBatch([strongDuplicate]);

    expect(screen.getByText(/Highly similar to an existing item/)).toBeTruthy();
    expect(screen.getByText(/similarity: 95%/)).toBeTruthy();

    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));

    // The critical assertion: no mutation at all, so nothing can be created.
    expect(hooks.accept).not.toHaveBeenCalled();
    expect(screen.getByText(/An existing item is highly similar/)).toBeTruthy();
    expect(screen.getByTestId(`confirm-duplicate-${STRONG_DUP_ID}`)).toBeTruthy();
  });

  it("sends acknowledgeDuplicate=true only after explicit confirmation", async () => {
    renderWithBatch([strongDuplicate]);

    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));
    expect(hooks.accept).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(`confirm-duplicate-${STRONG_DUP_ID}`));
    // Confirming alone must not create anything either.
    expect(hooks.accept).not.toHaveBeenCalled();
    expect(screen.getByText(/Duplicate confirmed/)).toBeTruthy();

    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));

    await waitFor(() => expect(hooks.accept).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.accept).acknowledgeDuplicate).toBe(true);
  });

  it("lets the reviewer back out of the confirmation without accepting", () => {
    renderWithBatch([strongDuplicate]);

    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));
    fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));

    expect(hooks.accept).not.toHaveBeenCalled();
    expect(screen.queryByTestId(`confirm-duplicate-${STRONG_DUP_ID}`)).toBeNull();
    expect(screen.queryByText(/Duplicate confirmed/)).toBeNull();
  });

  it("distinguishes normal, flagged, and confirmed states visually", () => {
    renderWithBatch([kpiSuggestion(), strongDuplicate]);

    // Normal: no warning region at all.
    expect(screen.queryByTestId(`duplicate-warning-${CLEAN_ID}`)).toBeNull();

    // Flagged: amber warning, and the action reads as a review step.
    const flagged = screen.getByTestId(`duplicate-warning-${STRONG_DUP_ID}`);
    expect(flagged.className).toContain("amber");
    expect(screen.getByTestId(`accept-${STRONG_DUP_ID}`).textContent).toContain("Review duplicate");

    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));
    fireEvent.click(screen.getByTestId(`confirm-duplicate-${STRONG_DUP_ID}`));

    // Confirmed: emerald, and the action becomes an ordinary Accept.
    const confirmed = screen.getByTestId(`duplicate-warning-${STRONG_DUP_ID}`);
    expect(confirmed.className).toContain("emerald");
    expect(screen.getByTestId(`accept-${STRONG_DUP_ID}`).textContent).toContain("Accept");
  });

  it("clears confirmations when a new batch is generated", async () => {
    const { rerender } = renderWithBatch([strongDuplicate]);
    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));
    fireEvent.click(screen.getByTestId(`confirm-duplicate-${STRONG_DUP_ID}`));
    expect(screen.getByText(/Duplicate confirmed/)).toBeTruthy();

    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: THEME_ID } });
    fireEvent.click(screen.getByTestId("generate"));
    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    rerender(<AiSuggestModal onClose={() => {}} initialTypeFilter="all" />);

    expect(screen.queryByText(/Duplicate confirmed/)).toBeNull();
  });
});

describe("AiSuggestModal — accept all", () => {
  it("submits safe suggestions in one batched call", async () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() => expect(hooks.acceptMany).toHaveBeenCalledOnce());
    expect(hooks.accept).not.toHaveBeenCalled();
    const sent = payloadOf(hooks.acceptMany).suggestions as Array<Record<string, unknown>>;
    expect(sent).toHaveLength(2);
    expect(sent.every((item) => item.acknowledgeDuplicate === false)).toBe(true);
  });

  it("NEVER silently sweeps up an unconfirmed strong duplicate", async () => {
    renderWithBatch([kpiSuggestion(), strongDuplicate]);

    expect(screen.getByTestId("accept-all").textContent).toContain("Accept all (1)");

    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() => expect(hooks.acceptMany).toHaveBeenCalledOnce());
    const sent = payloadOf(hooks.acceptMany).suggestions as Array<{ suggestionId: string }>;
    expect(sent.map((item) => item.suggestionId)).toEqual([CLEAN_ID]);
    expect(sent.map((item) => item.suggestionId)).not.toContain(STRONG_DUP_ID);
  });

  it("leaves the withheld duplicate listed and says so", async () => {
    hooks.acceptMany.mockResolvedValue({
      accepted: [
        {
          suggestionId: CLEAN_ID,
          subjectType: "kpi_definition",
          subjectId: "created-kpi",
          alreadyAccepted: false,
          edited: false,
        },
      ],
      failed: [],
    });
    renderWithBatch([kpiSuggestion(), strongDuplicate]);
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() =>
      expect(screen.getByText(/1 possible duplicate\(s\) were left for individual review/)).toBeTruthy(),
    );
    expect(screen.getByText("Customer Retention Rate")).toBeTruthy();
    expect(screen.queryByText("LTV to CAC Ratio")).toBeNull();
  });

  it("creates nothing when every remaining suggestion is an unconfirmed duplicate", async () => {
    renderWithBatch([strongDuplicate]);
    expect(screen.getByTestId("accept-all").textContent).toContain("Accept all (0)");

    fireEvent.click(screen.getByTestId("accept-all"));

    expect(hooks.acceptMany).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText(/Nothing was created\. 1 possible duplicate\(s\) need individual review/))
        .toBeTruthy(),
    );
  });

  it("includes a duplicate once the reviewer has confirmed it", async () => {
    renderWithBatch([kpiSuggestion(), strongDuplicate]);
    fireEvent.click(screen.getByTestId(`accept-${STRONG_DUP_ID}`));
    fireEvent.click(screen.getByTestId(`confirm-duplicate-${STRONG_DUP_ID}`));

    expect(screen.getByTestId("accept-all").textContent).toContain("Accept all (2)");
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() => expect(hooks.acceptMany).toHaveBeenCalledOnce());
    const sent = payloadOf(hooks.acceptMany).suggestions as Array<Record<string, unknown>>;
    const confirmed = sent.find((item) => item.suggestionId === STRONG_DUP_ID);
    const clean = sent.find((item) => item.suggestionId === CLEAN_ID);
    expect(confirmed?.acknowledgeDuplicate).toBe(true);
    expect(clean?.acknowledgeDuplicate).toBe(false);
  });

  it("reports partial failure per item and keeps the failed ones listed", async () => {
    hooks.acceptMany.mockResolvedValue({
      accepted: [
        {
          suggestionId: CLEAN_ID,
          subjectType: "kpi_definition",
          subjectId: "created-kpi",
          alreadyAccepted: false,
          edited: false,
        },
      ],
      failed: [
        { suggestionId: OKR_ID, reason: "creation_failed", message: "Unable to create OKR" },
      ],
    });
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() =>
      expect(screen.getByText(/Created 1 item\(s\); 1 could not be created/)).toBeTruthy(),
    );
    expect(screen.getByText("Unable to create OKR")).toBeTruthy();
    expect(screen.queryByText("LTV to CAC Ratio")).toBeNull();
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
  });

  it("surfaces a whole-batch failure", async () => {
    hooks.acceptMany.mockRejectedValue(new Error("Unable to accept these suggestions"));
    renderWithBatch([kpiSuggestion()]);
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() =>
      expect(screen.getByText("Unable to accept these suggestions")).toBeTruthy(),
    );
    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
  });
});

describe("AiSuggestModal — origin/main component API", () => {
  it("defaults to the KPI filter, as its call-site contract promises", () => {
    hooks.state.generateData = batch([kpiSuggestion(), okrSuggestion()]);
    render(<AiSuggestModal onClose={() => {}} />);

    // Default initialTypeFilter="kpi" — the OKR is filtered out.
    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.queryByText("Expand into enterprise accounts")).toBeNull();
  });

  it("honours initialTypeFilter from the OKR library call site", () => {
    hooks.state.generateData = batch([kpiSuggestion(), okrSuggestion()]);
    render(<AiSuggestModal onClose={() => {}} initialTypeFilter="okr" />);

    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
    expect(screen.queryByText("LTV to CAC Ratio")).toBeNull();
  });

  it("generates only the pre-selected kind without the reviewer touching a tab", async () => {
    render(<AiSuggestModal onClose={() => {}} initialTypeFilter="okr" />);
    fireEvent.change(screen.getByTestId("theme-select"), { target: { value: THEME_ID } });
    fireEvent.click(screen.getByTestId("generate"));

    await waitFor(() => expect(hooks.generate).toHaveBeenCalledOnce());
    expect(payloadOf(hooks.generate).kinds).toEqual(["okr"]);
  });

  it("defaults to global mode, showing the whole batch", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);

    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
  });

  it("honours initialMode=\"one-by-one\" and shows a single card", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()], { initialMode: "one-by-one" });

    expect(screen.getByText("LTV to CAC Ratio")).toBeTruthy();
    expect(screen.queryByText("Expand into enterprise accounts")).toBeNull();
  });

  it("advances to the next card as each one is resolved in one-by-one mode", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()], { initialMode: "one-by-one" });

    fireEvent.click(screen.getByTestId(`reject-${CLEAN_ID}`));

    expect(screen.queryByText("LTV to CAC Ratio")).toBeNull();
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
  });

  it("lets the reviewer switch presentation mode after generating", () => {
    renderWithBatch([kpiSuggestion(), okrSuggestion()]);

    fireEvent.click(screen.getByTestId("mode-one-by-one"));
    expect(screen.queryByText("Expand into enterprise accounts")).toBeNull();

    fireEvent.click(screen.getByTestId("mode-global"));
    expect(screen.getByText("Expand into enterprise accounts")).toBeTruthy();
  });

  it("Accept all still covers the whole remaining batch in one-by-one mode", async () => {
    // Only one card is on screen, but "Accept all" means all of them — a batch
    // action must not silently shrink to whatever the cursor happens to show.
    renderWithBatch([kpiSuggestion(), okrSuggestion()], { initialMode: "one-by-one" });

    expect(screen.getByTestId("accept-all").textContent).toContain("Accept all (2)");
    fireEvent.click(screen.getByTestId("accept-all"));

    await waitFor(() => expect(hooks.acceptMany).toHaveBeenCalledOnce());
    const sent = payloadOf(hooks.acceptMany).suggestions as Array<{ suggestionId: string }>;
    expect(sent.map((item) => item.suggestionId).sort()).toEqual([CLEAN_ID, OKR_ID].sort());
  });

  it("never imports the deleted suggestion mock data", async () => {
    // A plain path, not import.meta.url: the happy-dom environment rewrites
    // import.meta.url to a non-file scheme that readFileSync rejects.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "src/components/kpi-workspace/AiSuggestModal.tsx",
      "utf8",
    );

    expect(source).not.toContain("mockKpiSuggestions");
    expect(source).not.toContain("kpiSuggestions");
    expect(source).toContain("trpc.aiSuggestion.generate.useMutation");
  });
});
