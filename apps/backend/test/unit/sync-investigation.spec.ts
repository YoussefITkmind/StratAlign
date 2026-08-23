import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncInvestigationService } from "../../src/modules/sync-investigation/sync-investigation.service";
import {
  computeVolumeAnomaly,
  SIGNIFICANT_DROP_THRESHOLD_PERCENT,
} from "../../src/modules/sync-investigation/volume-anomaly";
import {
  AiMalformedOutputError,
  AiTimeoutError,
  AiUnavailableError,
} from "../../src/modules/ai/ai.errors";
import { SyncRunNotFoundError } from "../../src/modules/sync-logs/sync-log.errors";
import { createLogger } from "../../src/logging/logger";
import type { SyncRunDetail, SyncRunSummary } from "../../src/modules/sync-logs/sync-log.types";

/**
 * Generation is the boundary where untrusted model text becomes a typed
 * investigation result. These tests hold that boundary, plus the deterministic
 * historical-volume arithmetic the service must compute itself rather than
 * leave to the model.
 */

const SYNC_RUN_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY = "salesforce-accounts";

function syncRun(overrides: Partial<SyncRunDetail> = {}): SyncRunDetail {
  return {
    id: SYNC_RUN_ID,
    sourceKey: SOURCE_KEY,
    sourceName: "Salesforce Accounts",
    status: "failed",
    startedAt: new Date("2026-08-20T10:00:00Z"),
    completedAt: new Date("2026-08-20T10:05:00Z"),
    recordsProcessed: 420,
    recordsCreated: 10,
    recordsUpdated: 5,
    recordsFailed: 405,
    errorCode: "AUTH_401",
    errorMessage: "Authentication failed against the Salesforce API.",
    logExcerpt: "ERROR 401 Unauthorized while refreshing OAuth token",
    ...overrides,
  };
}

function historicalRun(recordsProcessed: number): SyncRunSummary {
  return {
    id: crypto.randomUUID(),
    sourceKey: SOURCE_KEY,
    sourceName: "Salesforce Accounts",
    status: "success",
    startedAt: new Date("2026-08-19T10:00:00Z"),
    completedAt: new Date("2026-08-19T10:05:00Z"),
    recordsProcessed,
    recordsCreated: recordsProcessed,
    recordsUpdated: 0,
    recordsFailed: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function completion(payload: unknown) {
  return {
    text: typeof payload === "string" ? payload : JSON.stringify(payload),
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 842,
  };
}

const validOutput = {
  diagnosis:
    "The sync failed almost immediately with a 401 error, and the OAuth token refresh appears to have failed.",
  likelyCause: "Expired or revoked Salesforce OAuth credentials",
  recommendedNextSteps: ["Check source credentials", "Re-run the sync after refreshing credentials"],
  confidence: 0.82,
  insufficientData: false,
  evidence: ["error code AUTH_401", "log excerpt mentions Unauthorized while refreshing OAuth token"],
};

function makeService(overrides: {
  complete?: ReturnType<typeof vi.fn>;
  getById?: ReturnType<typeof vi.fn>;
  listRecentSuccessful?: ReturnType<typeof vi.fn>;
} = {}) {
  const complete = overrides.complete ?? vi.fn().mockResolvedValue(completion(validOutput));
  const getById = overrides.getById ?? vi.fn().mockResolvedValue(syncRun());
  const listRecentSuccessful =
    overrides.listRecentSuccessful ?? vi.fn().mockResolvedValue([]);

  const service = new SyncInvestigationService(
    { getById, listRecentSuccessful },
    { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete } as never,
    createLogger("error"),
  );

  return { service, complete, getById, listRecentSuccessful };
}

describe("historical volume calculation", () => {
  it("reports no historical data when there is no successful run history", () => {
    const result = computeVolumeAnomaly(420, []);

    expect(result.hasHistoricalData).toBe(false);
    expect(result.previousSuccessfulAverage).toBeNull();
    expect(result.percentDrop).toBeNull();
    expect(result.isSignificantDrop).toBe(false);
  });

  it("computes the average and percent drop against recent successful runs", () => {
    const result = computeVolumeAnomaly(420, [2000, 1900, 1700]);

    expect(result.hasHistoricalData).toBe(true);
    expect(result.previousSuccessfulAverage).toBeCloseTo(1866.67, 1);
    expect(result.mostRecentSuccessfulVolume).toBe(2000);
    expect(result.percentDrop).toBeCloseTo(77.5, 1);
    expect(result.isSignificantDrop).toBe(true);
  });

  it("does not flag a drop below the significance threshold", () => {
    const result = computeVolumeAnomaly(1800, [2000]);

    expect(result.percentDrop).toBeCloseTo(10, 1);
    expect(result.percentDrop).toBeLessThan(SIGNIFICANT_DROP_THRESHOLD_PERCENT);
    expect(result.isSignificantDrop).toBe(false);
  });

  it("reports a negative drop when the current run is larger than history", () => {
    const result = computeVolumeAnomaly(2500, [2000]);

    expect(result.percentDrop).toBeLessThan(0);
    expect(result.isSignificantDrop).toBe(false);
  });

  it("does not compute a drop when the current volume is unknown", () => {
    const result = computeVolumeAnomaly(null, [2000, 1900]);

    expect(result.hasHistoricalData).toBe(true);
    expect(result.percentDrop).toBeNull();
    expect(result.isSignificantDrop).toBe(false);
  });
});

describe("sync investigation", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("context construction and evidence", () => {
    it("passes the current sync, historical volume, and logs to the model", async () => {
      const { service, complete } = makeService({
        listRecentSuccessful: vi.fn().mockResolvedValue([
          historicalRun(2000),
          historicalRun(1900),
        ]),
      });

      await service.investigate({ syncRunId: SYNC_RUN_ID });

      const request = complete.mock.calls[0][0];
      expect(request.prompt).toContain("CURRENT SYNC");
      expect(request.prompt).toContain("HISTORICAL VOLUME");
      expect(request.prompt).toContain("LOGS / ERRORS");
      expect(request.prompt).toContain("AUTH_401");
      expect(request.prompt).toContain("Unauthorized while refreshing OAuth token");
      expect(request.prompt).toContain("2000");
      expect(request.feature).toBe("sync-logs.ai-investigation");
      expect(request.system).toContain("Use only the evidence supplied to you below");
    });

    it("asks the reader for history scoped to this run's source, excluding itself", async () => {
      const { service, listRecentSuccessful } = makeService();

      await service.investigate({ syncRunId: SYNC_RUN_ID });

      expect(listRecentSuccessful).toHaveBeenCalledWith(SOURCE_KEY, SYNC_RUN_ID, 5);
    });

    it("does not inject facts the reader never supplied", async () => {
      const { service, complete } = makeService({
        getById: vi.fn().mockResolvedValue(
          syncRun({ errorCode: null, errorMessage: null, logExcerpt: null }),
        ),
      });

      await service.investigate({ syncRunId: SYNC_RUN_ID });

      const prompt: string = complete.mock.calls[0][0].prompt;
      expect(prompt).toContain("(none recorded)");
      expect(prompt).toContain("(none available)");
      expect(prompt).not.toContain("AUTH_401");
    });

    it("throws when the sync run does not exist", async () => {
      const { service } = makeService({ getById: vi.fn().mockResolvedValue(null) });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(SyncRunNotFoundError);
    });
  });

  describe("structured output", () => {
    it("returns a well-formed investigation result", async () => {
      const { service } = makeService();

      const result = await service.investigate({ syncRunId: SYNC_RUN_ID });

      expect(result.syncRunId).toBe(SYNC_RUN_ID);
      expect(result.diagnosis).toBe(validOutput.diagnosis);
      expect(result.likelyCause).toBe(validOutput.likelyCause);
      expect(result.recommendedNextSteps).toEqual(validOutput.recommendedNextSteps);
      expect(result.insufficientData).toBe(false);
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-sonnet-5");
    });

    it("tolerates a fenced or prose-wrapped JSON object", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion("Here's what I found:\n```json\n" + JSON.stringify(validOutput) + "\n```"),
        ),
      });

      const result = await service.investigate({ syncRunId: SYNC_RUN_ID });
      expect(result.diagnosis).toBe(validOutput.diagnosis);
    });

    it("accepts an insufficient-data response with no likely cause", async () => {
      const insufficient = {
        diagnosis:
          "There is no error message, log excerpt, or historical data for this source, so no cause can be determined.",
        likelyCause: null,
        recommendedNextSteps: ["Wait for another run or check the source system directly"],
        confidence: 0.1,
        insufficientData: true,
        evidence: [],
      };
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion(insufficient)),
      });

      const result = await service.investigate({ syncRunId: SYNC_RUN_ID });

      expect(result.insufficientData).toBe(true);
      expect(result.likelyCause).toBeNull();
    });

    it("rejects an insufficient-data response that still states a likely cause", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ ...validOutput, insufficientData: true }),
        ),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects output that is not JSON at all", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion("It probably failed because of credentials.")),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects an entirely empty completion", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion("   ")),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a confidence outside the agreed 0-1 range", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ ...validOutput, confidence: 91 })),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a response missing a required field", async () => {
      const withoutDiagnosis: Record<string, unknown> = { ...validOutput };
      delete withoutDiagnosis.diagnosis;
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion(withoutDiagnosis)),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("does not leak model output into the error a caller sees", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ ...validOutput, confidence: 91 })),
      });

      const failure = await service
        .investigate({ syncRunId: SYNC_RUN_ID })
        .catch((error: unknown) => error as Error);

      expect(failure.message).toBe("The AI response could not be understood");
      expect(failure.message).not.toContain("OAuth");
    });
  });

  describe("provider failures", () => {
    it("propagates unavailability without wrapping it", async () => {
      const { service } = makeService({
        complete: vi.fn().mockRejectedValue(new AiUnavailableError()),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiUnavailableError);
    });

    it("propagates a timeout distinctly from unavailability", async () => {
      const { service } = makeService({
        complete: vi.fn().mockRejectedValue(new AiTimeoutError()),
      });

      await expect(
        service.investigate({ syncRunId: SYNC_RUN_ID }),
      ).rejects.toBeInstanceOf(AiTimeoutError);
    });
  });
});
