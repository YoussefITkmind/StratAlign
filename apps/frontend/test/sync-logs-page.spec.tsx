// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Behavioural tests for the Sync Logs page and its AI investigation panel.
 *
 * tRPC is mocked at the client module so the hooks behave like real query and
 * mutation hooks — including `isPending`/`isError`, which is what the UI
 * branches on for loading, success, insufficient-data, and error states.
 */

const SYNC_RUN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_RUN_ID = "22222222-2222-4222-8222-222222222222";

const hooks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  investigateMutate: vi.fn(),
  state: {
    investigatePending: false,
    investigateError: null as unknown,
    investigateData: undefined as unknown,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    syncLog: {
      list: { useQuery: () => hooks.list() },
      get: { useQuery: () => hooks.get() },
      investigate: {
        useMutation: () => ({
          mutate: hooks.investigateMutate,
          isPending: hooks.state.investigatePending,
          isError: hooks.state.investigateError !== null,
          error: hooks.state.investigateError,
          data: hooks.state.investigateData,
        }),
      },
    },
  },
}));

import SyncLogsPage from "@/components/sync-logs/SyncLogsPage";

function syncRun(overrides: Record<string, unknown> = {}) {
  return {
    id: SYNC_RUN_ID,
    sourceKey: "salesforce-accounts",
    sourceName: "Salesforce Accounts",
    status: "failed" as const,
    startedAt: "2026-08-20T10:00:00Z",
    completedAt: "2026-08-20T10:05:00Z",
    recordsProcessed: 420,
    recordsCreated: 10,
    recordsUpdated: 5,
    recordsFailed: 405,
    errorCode: "AUTH_401",
    errorMessage: "Authentication failed",
    ...overrides,
  };
}

const investigationResult = {
  syncRunId: SYNC_RUN_ID,
  diagnosis: "The sync failed due to an authentication error against the source.",
  likelyCause: "Expired OAuth credentials",
  recommendedNextSteps: ["Check source credentials", "Re-run the sync"],
  confidence: 0.8,
  insufficientData: false,
  evidence: ["error code AUTH_401"],
  provider: "anthropic",
  model: "claude-sonnet-5",
  latencyMs: 800,
};

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.investigatePending = false;
  hooks.state.investigateError = null;
  hooks.state.investigateData = undefined;
  hooks.list.mockReturnValue({ data: [syncRun()], isLoading: false, isError: false });
  hooks.get.mockReturnValue({ data: syncRun() });
});

afterEach(() => cleanup());

describe("Sync Logs page", () => {
  it("renders the sync log table with its rows", () => {
    render(<SyncLogsPage />);

    expect(screen.getByText("Salesforce Accounts")).toBeTruthy();
    expect(screen.getByText("AUTH_401")).toBeTruthy();
    expect(screen.getByTestId(`investigate-${SYNC_RUN_ID}`)).toBeTruthy();
  });

  it("renders an empty state when there are no sync runs", () => {
    hooks.list.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<SyncLogsPage />);

    expect(screen.getByText("No sync runs recorded yet.")).toBeTruthy();
  });

  it("shows a list error state with retry", () => {
    const refetch = vi.fn();
    hooks.list.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("network down"),
      refetch,
    });
    render(<SyncLogsPage />);

    expect(screen.getByText(/Couldn't load sync logs/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("retry-list"));
    expect(refetch).toHaveBeenCalled();
  });

  it("opens the investigation panel and auto-triggers investigation on Investigate", async () => {
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    expect(screen.getByTestId("investigation-panel")).toBeTruthy();
    await waitFor(() =>
      expect(hooks.investigateMutate).toHaveBeenCalledWith({ syncRunId: SYNC_RUN_ID }),
    );
  });

  it("does not disable the underlying table while investigating", () => {
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    const button = screen.getByTestId(`investigate-${SYNC_RUN_ID}`) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it("shows a loading state while the investigation is in flight", () => {
    hooks.state.investigatePending = true;
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    expect(screen.getByTestId("investigation-loading")).toBeTruthy();
  });

  it("renders the diagnosis, evidence, and recommended next steps on success", () => {
    hooks.state.investigateData = investigationResult;
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    expect(screen.getByTestId("diagnosis").textContent).toContain(investigationResult.diagnosis);
    expect(screen.getByTestId("evidence-list").textContent).toContain("error code AUTH_401");
    expect(screen.getByTestId("recommended-steps").textContent).toContain(
      "Check source credentials",
    );
    expect(screen.getByTestId("recommended-steps").textContent).toContain("Re-run the sync");
  });

  it("always shows the AI-generated disclaimer", () => {
    hooks.state.investigateData = investigationResult;
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    const disclaimer = screen.getByTestId("ai-disclaimer").textContent ?? "";
    expect(disclaimer).toContain("AI-generated diagnosis");
    expect(disclaimer).toContain("not a guaranteed fix");
  });

  it("renders the insufficient-data state distinctly, without a fabricated cause", () => {
    hooks.state.investigateData = {
      ...investigationResult,
      likelyCause: null,
      insufficientData: true,
      evidence: [],
      recommendedNextSteps: [],
    };
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    expect(screen.getByTestId("insufficient-data-badge")).toBeTruthy();
    expect(screen.queryByText(/Likely cause:/)).toBeNull();
  });

  it("shows an error state with a retry action on investigation failure", () => {
    hooks.state.investigateError = new Error("AI investigation is unavailable right now.");
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));

    expect(screen.getByTestId("investigation-error").textContent).toContain(
      "AI investigation is unavailable right now.",
    );

    fireEvent.click(screen.getByTestId("retry-investigation"));
    expect(hooks.investigateMutate).toHaveBeenCalledTimes(2);
    expect(hooks.investigateMutate).toHaveBeenLastCalledWith({ syncRunId: SYNC_RUN_ID });
  });

  it("closes the panel and re-opens fresh for a different run", async () => {
    hooks.list.mockReturnValue({
      data: [syncRun(), syncRun({ id: OTHER_RUN_ID, sourceName: "HR Feed" })],
      isLoading: false,
      isError: false,
    });
    render(<SyncLogsPage />);

    fireEvent.click(screen.getByTestId(`investigate-${SYNC_RUN_ID}`));
    fireEvent.click(screen.getByTestId("close-panel"));
    expect(screen.queryByTestId("investigation-panel")).toBeNull();

    fireEvent.click(screen.getByTestId(`investigate-${OTHER_RUN_ID}`));
    await waitFor(() =>
      expect(hooks.investigateMutate).toHaveBeenLastCalledWith({ syncRunId: OTHER_RUN_ID }),
    );
  });
});
