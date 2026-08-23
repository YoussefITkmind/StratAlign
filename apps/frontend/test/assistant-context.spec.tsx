// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

/**
 * Behavioural tests for the assistant's conversation/context state.
 *
 * The requirement under test (Task 1, "Context Switching") is specific: when
 * the user navigates to a different module, the conversation must not be
 * cleared, a context-switch event must appear, and the module the assistant
 * reports must update. These tests exercise `AssistantProvider` directly
 * through its public hooks rather than the panel UI, so they hold on to that
 * behaviour even if the panel's markup changes.
 */

const hooks = vi.hoisted(() => ({
  ask: vi.fn(),
  state: { pending: false },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    assistant: {
      ask: {
        useMutation: () => ({
          mutateAsync: hooks.ask,
          isPending: hooks.state.pending,
        }),
      },
    },
  },
}));

const pathnameState = { current: "/balanced-scorecards" };
vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.current,
}));

import {
  AssistantProvider,
  useAssistant,
  usePublishAssistantContext,
} from "@/lib/assistant/assistant-context";

function Harness() {
  const { moduleContext, timeline, sendMessage, isSending, error, retry } = useAssistant();
  usePublishAssistantContext(
    moduleContext.module,
    null,
    moduleContext.module === "balanced_scorecards" ? { onTrack: 3 } : null,
  );
  const [draft, setDraft] = useState("");

  return (
    <div>
      <p data-testid="module">{moduleContext.module}</p>
      <p data-testid="data">{JSON.stringify(moduleContext.data)}</p>
      <ul>
        {timeline.map((entry) => (
          <li key={entry.id} data-testid={`entry-${entry.kind}`}>
            {entry.kind === "message" ? `${entry.role}:${entry.content}` : `switch:${entry.moduleName}`}
          </li>
        ))}
      </ul>
      {error && <p data-testid="error">{error}</p>}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} data-testid="draft" />
      <button data-testid="send" onClick={() => sendMessage(draft)} disabled={isSending}>
        Send
      </button>
      <button data-testid="retry" onClick={retry}>
        Retry
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <AssistantProvider>
      <Harness />
    </AssistantProvider>,
  );
}

describe("AssistantProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathnameState.current = "/balanced-scorecards";
  });
  afterEach(cleanup);

  it("publishes a module's context and includes it when asking a question", async () => {
    hooks.ask.mockResolvedValue({
      answer: "No KPI is currently off track.",
      confidence: 0.9,
      grounded: true,
      insufficientContext: false,
      referencedEntities: [],
    });

    renderHarness();
    await waitFor(() => expect(screen.getByTestId("data").textContent).toContain("onTrack"));

    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "Which KPIs are underperforming?" },
    });
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => expect(hooks.ask).toHaveBeenCalledTimes(1));
    const sentPayload = hooks.ask.mock.calls[0][0];
    expect(sentPayload.context.module).toBe("balanced_scorecards");
    expect(sentPayload.context.data).toEqual({ onTrack: 3 });
  });

  it("preserves the conversation and appends a switch event when the module changes", async () => {
    hooks.ask.mockResolvedValue({
      answer: "Based on the current scorecard, all KPIs are on track.",
      confidence: 0.9,
      grounded: true,
      insufficientContext: false,
      referencedEntities: [],
    });

    const { rerender } = renderHarness();

    fireEvent.change(screen.getByTestId("draft"), {
      target: { value: "Which KPIs are underperforming?" },
    });
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => expect(screen.getByTestId("entry-message")).toBeTruthy());
    await waitFor(() =>
      expect(screen.getAllByTestId("entry-message").length).toBe(2), // user + assistant
    );

    pathnameState.current = "/strategy-hierarchy";
    rerender(
      <AssistantProvider>
        <Harness />
      </AssistantProvider>,
    );

    // The provider is not remounted (same component identity at the same
    // tree position, exactly as it stays mounted across a real route change
    // inside AppShell) — it only re-renders with the new pathname. History
    // must survive, the module must update, and a switch event must appear.
    await waitFor(() => expect(screen.getByTestId("module").textContent).toBe("strategy_hierarchy"));
    expect(screen.getAllByTestId("entry-message").length).toBe(2);
    expect(screen.getByTestId("entry-context-switch").textContent).toBe("switch:Strategy Hierarchy");
  });

  it("marks a failed message and lets retry re-ask without duplicating the user turn", async () => {
    hooks.ask.mockRejectedValueOnce(new Error("The AI assistant is unavailable right now."));
    hooks.ask.mockResolvedValueOnce({
      answer: "Recovered answer.",
      confidence: 0.7,
      grounded: true,
      insufficientContext: false,
      referencedEntities: [],
    });

    renderHarness();

    fireEvent.change(screen.getByTestId("draft"), { target: { value: "Explain this KPI." } });
    fireEvent.click(screen.getByTestId("send"));

    await waitFor(() => expect(screen.getByTestId("error")).toBeTruthy());
    expect(screen.getAllByTestId("entry-message").length).toBe(1);

    fireEvent.click(screen.getByTestId("retry"));

    await waitFor(() => expect(hooks.ask).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByTestId("entry-message").length).toBe(2));
  });
});
