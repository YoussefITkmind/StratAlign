// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Behavioural tests for the Sync Logs investigation experience.
 *
 * The load-bearing assertions are the honesty ones: the result must always be
 * labelled AI-generated, an insufficient-data answer must read as one rather
 * than as a diagnosis, and a failure must never surface raw provider or
 * transport detail. The rest — loading state, duplicate-click prevention —
 * protects a mutation that costs money each time it runs.
 *
 * tRPC is mocked at the client module so the mutation hook behaves like a real
 * one, including `isPending`, which is what disables the buttons.
 */

const hooks = vi.hoisted(() => ({
  investigate: vi.fn(),
  logs: vi.fn(),
  state: { isPending: false },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    integrations: {
      syncLogs: {
        list: { useQuery: () => hooks.logs() },
        investigate: {
          useMutation: () => ({
            mutateAsync: hooks.investigate,
            isPending: hooks.state.isPending,
          }),
        },
      },
    },
  },
}));

import SyncLogsTab from "@/components/data-integrations/tabs/SyncLogsTab";

const FAILED_ID = "11111111-1111-4111-8111-111111111111";
const SUCCESS_ID = "22222222-2222-4222-8222-222222222222";

const failedLog = {
  id: FAILED_ID,
  integration: "Snowflake ETL Service",
  started: "Today 09:00",
  duration: "1m 02s",
  status: "FAILED" as const,
  recordsIn: 0,
  recordsOut: 0,
  errors: 3,
  message: "Authentication failed",
  color: "bg-blue-500",
  icon: "SF",
};

const successLog = {
  ...failedLog,
  id: SUCCESS_ID,
  integration: "NetSuite ERP",
  status: "SUCCESS" as const,
  recordsIn: 420,
  recordsOut: 400,
  errors: 0,
  message: "Sync completed",
};

const diagnosis = {
  syncLogId: FAILED_ID,
  integration: "Snowflake ETL Service",
  kind: "SYNC_FAILURE" as const,
  source: "ai" as const,
  diagnosis: "The source system rejected the credential supplied by this integration.",
  likelyCause: "An expired or revoked authentication credential on the source connection.",
  confidence: "medium" as const,
  evidence: ["The run reported 3 errors.", "The recorded message mentions an authentication failure."],
  recommendedActions: ["Check the source credentials for this integration.", "Re-run the sync."],
  insufficientData: false,
  insufficientReasons: [],
  volume: null,
  evidenceLogCount: 4,
  generatedAt: "2026-08-25T09:00:00.000Z",
};

function renderTab() {
  return render(<SyncLogsTab search="" />);
}

function investigateButtons() {
  return screen.getAllByRole("button", { name: /investigate/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.state.isPending = false;
  hooks.logs.mockReturnValue({ data: [failedLog, successLog], isLoading: false });
  hooks.investigate.mockResolvedValue(diagnosis);
});

afterEach(cleanup);

describe("Sync Logs investigation", () => {
  describe("trigger", () => {
    it("offers an Investigate action on every sync log row", () => {
      renderTab();

      expect(
        screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Investigate NetSuite ERP sync run" }),
      ).toBeTruthy();
    });

    it("sends only the sync log id to the backend", async () => {
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      await waitFor(() => expect(hooks.investigate).toHaveBeenCalledWith({ syncLogId: FAILED_ID }));
    });

    it("investigates the most recent failure from the banner", async () => {
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: /investigate latest failure/i }));

      await waitFor(() => expect(hooks.investigate).toHaveBeenCalledWith({ syncLogId: FAILED_ID }));
    });

    it("shows no investigation panel until one is requested", () => {
      renderTab();

      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  describe("loading", () => {
    it("shows a loading state and blocks a duplicate request while one is in flight", async () => {
      // Mirrors the real hook: `isPending` flips as the mutation starts, and
      // the re-render triggered by the component's own state picks it up.
      hooks.investigate.mockImplementation(() => {
        hooks.state.isPending = true;
        return new Promise(() => {});
      });
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/reviewing sync logs/i)).toBeTruthy();
      expect(within(dialog).queryByText(/ai-generated diagnosis/i)).toBeNull();

      for (const button of investigateButtons()) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }

      fireEvent.click(screen.getByRole("button", { name: "Investigate NetSuite ERP sync run" }));
      expect(hooks.investigate).toHaveBeenCalledTimes(1);
    });
  });

  describe("successful diagnosis", () => {
    it("labels the result as AI-generated and shows the disclaimer", async () => {
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      // Twice by design: a badge above the result and again in the disclaimer.
      expect(within(dialog).getAllByText(/ai-generated diagnosis/i).length).toBeGreaterThan(0);
      expect(within(dialog).getByText(/not a\s+guaranteed root cause or a fix/i)).toBeTruthy();
      expect(within(dialog).getByText(/nothing has been changed or retried/i)).toBeTruthy();
    });

    it("shows the diagnosis, likely cause, confidence, evidence and next steps", async () => {
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(diagnosis.diagnosis)).toBeTruthy();
      expect(within(dialog).getByText(diagnosis.likelyCause)).toBeTruthy();
      expect(within(dialog).getByText(/medium confidence/i)).toBeTruthy();
      for (const item of [...diagnosis.evidence, ...diagnosis.recommendedActions]) {
        expect(within(dialog).getByText(item)).toBeTruthy();
      }
    });

    it("surfaces a low-confidence answer as low confidence", async () => {
      hooks.investigate.mockResolvedValue({ ...diagnosis, confidence: "low" });
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/low confidence/i)).toBeTruthy();
    });

    it("reports the deterministic volume comparison when there was a drop", async () => {
      hooks.investigate.mockResolvedValue({
        ...diagnosis,
        kind: "VOLUME_DROP",
        volume: {
          currentVolume: 420,
          historicalAverage: 1000,
          changePercent: -58,
          sampleCount: 10,
          isAnomalousDrop: true,
        },
      });
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate NetSuite ERP sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/420 records this run/i)).toBeTruthy();
      expect(within(dialog).getByText(/-58%/)).toBeTruthy();
    });

    it("closes without leaving the previous result behind", async () => {
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: /got it/i }));

      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
  });

  describe("insufficient data", () => {
    it("says the evidence is insufficient and offers no cause", async () => {
      hooks.investigate.mockResolvedValue({
        ...diagnosis,
        source: "deterministic",
        kind: "NO_ANOMALY",
        diagnosis:
          "Insufficient data to determine the likely cause. The run is marked as unsuccessful but carries no error message.",
        likelyCause: null,
        confidence: "low",
        evidence: ["Sync run status: FAILED (0 recorded errors)."],
        recommendedActions: ["Review the integration's latest error details in the Connections tab."],
        insufficientData: true,
        insufficientReasons: ["NO_ERROR_DETAIL"],
      });
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/not enough evidence for a reliable cause/i)).toBeTruthy();
      expect(within(dialog).getByText(/insufficient data to determine the likely cause/i)).toBeTruthy();
      expect(within(dialog).queryByText(/most likely cause/i)).toBeNull();
      expect(
        within(dialog).getByText(/review the integration's latest error details/i),
      ).toBeTruthy();
    });
  });

  describe("failure", () => {
    it("shows the application error message without any stack trace", async () => {
      hooks.investigate.mockRejectedValue(
        new Error("AI investigation is unavailable right now. Try again later."),
      );
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/investigation failed/i)).toBeTruthy();
      expect(within(dialog).getByText(/unavailable right now/i)).toBeTruthy();
      expect(within(dialog).queryByText(/ai-generated diagnosis/i)).toBeNull();
      expect(dialog.textContent ?? "").not.toContain("at Object.");
    });

    it("falls back to a generic message when the failure carries none", async () => {
      hooks.investigate.mockRejectedValue({});
      renderTab();

      fireEvent.click(screen.getByRole("button", { name: "Investigate Snowflake ETL Service sync run" }));

      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText(/unable to investigate this sync run/i)).toBeTruthy();
    });
  });
});
