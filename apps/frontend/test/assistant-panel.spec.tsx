// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@/lib/i18n/locale-context";

/**
 * UI-level tests for the assistant panel: open/close, the context indicator,
 * message submission, and the loading/error/retry states. Conversation and
 * context-switch behaviour itself is covered in `assistant-context.spec.tsx`
 * — this file only holds `AssistantPanel`'s rendering contract against
 * `useAssistant()`.
 */

const state = vi.hoisted(() => ({
  isOpen: true,
  timeline: [] as unknown[],
  moduleContext: {
    module: "balanced_scorecards",
    moduleName: "Balanced Scorecards",
    route: "/balanced-scorecards",
    entity: null,
    data: null,
    capabilities: ["analyze_kpis"],
    hasProvider: true,
  },
  isSending: false,
  error: null as string | null,
  sendMessage: vi.fn(),
  retry: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/lib/assistant/assistant-context", () => ({
  useAssistant: () => state,
}));

import { AssistantPanel } from "@/components/assistant/AssistantPanel";

function renderPanel() {
  return render(
    <LocaleProvider initialLocale="en">
      <AssistantPanel />
    </LocaleProvider>,
  );
}

describe("AssistantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.isOpen = true;
    state.timeline = [];
    state.isSending = false;
    state.error = null;
    state.moduleContext = {
      module: "balanced_scorecards",
      moduleName: "Balanced Scorecards",
      route: "/balanced-scorecards",
      entity: null,
      data: null,
      capabilities: ["analyze_kpis"],
      hasProvider: true,
    };
  });
  afterEach(cleanup);

  it("shows the assistant identity, current context, and disclaimer", () => {
    renderPanel();

    expect(screen.getByText("StratAlign AI")).toBeTruthy();
    expect(screen.getByText(/Context: Balanced Scorecards/)).toBeTruthy();
    expect(screen.getByText(/AI-generated response/)).toBeTruthy();
  });

  it("tells the user when the current module has no context provider yet", () => {
    state.moduleContext = { ...state.moduleContext, hasProvider: false };
    renderPanel();

    expect(screen.getByText(/isn't available yet/)).toBeTruthy();
  });

  it("sends the typed message and clears the input", () => {
    renderPanel();

    const input = screen.getByPlaceholderText("Ask anything about your strategy…");
    fireEvent.change(input, { target: { value: "Which KPIs are underperforming?" } });
    fireEvent.click(screen.getByText("Send"));

    expect(state.sendMessage).toHaveBeenCalledWith("Which KPIs are underperforming?");
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  it("sends on Enter and inserts a newline on Shift+Enter instead", () => {
    renderPanel();
    const input = screen.getByPlaceholderText("Ask anything about your strategy…");

    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(state.sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(state.sendMessage).toHaveBeenCalledWith("Hello");
  });

  it("shows a loading indicator while a question is in flight", () => {
    state.isSending = true;
    renderPanel();

    expect(screen.getByText("Thinking…")).toBeTruthy();
  });

  it("shows an error with a retry action that calls retry()", () => {
    state.error = "The assistant couldn't answer that.";
    renderPanel();

    expect(screen.getByText("The assistant couldn't answer that.")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it("calls close() from the close button", () => {
    renderPanel();

    fireEvent.click(screen.getByLabelText("Close assistant"));
    expect(state.close).toHaveBeenCalledTimes(1);
  });

  it("flags an assistant answer that was given with insufficient context", () => {
    state.timeline = [
      {
        kind: "message",
        id: "m1",
        role: "assistant",
        content: "I don't have enough data to determine that.",
        createdAt: Date.now(),
        insufficientContext: true,
      },
    ];
    renderPanel();

    expect(screen.getByText("Limited context")).toBeTruthy();
  });
});
