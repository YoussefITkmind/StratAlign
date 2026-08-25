import { beforeEach, describe, expect, it, vi } from "vitest";

import { SyncInvestigationService } from "../../src/modules/integrations/sync-investigation.service";
import {
  analyseVolume,
  buildInvestigationEvidence,
  MAX_MESSAGE_LENGTH,
  MAX_RELATED_LOGS,
  sanitiseText,
} from "../../src/modules/integrations/sync-investigation.evidence";
import { applyDiagnosisGuardrails } from "../../src/modules/integrations/sync-investigation.schema";
import { AiMalformedOutputError, AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";

/**
 * The two properties this feature lives or dies on:
 *
 *   1. It refuses to name a cause the evidence does not support — and, where
 *      the refusal is deterministic, it refuses *without* paying for a model
 *      call at all.
 *   2. Nothing credential-shaped, and nothing unbounded, reaches the provider.
 *
 * Every arithmetic assertion here is deliberate too: the percentages and
 * averages are the backend's job, not the model's, so they are pinned rather
 * than approximated.
 */

const SYNC_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

type Status = "SUCCESS" | "FAILED" | "PARTIAL" | "RUNNING";

let rowSeq = 0;

function log(overrides: Partial<{
  id: string;
  integrationName: string;
  startedLabel: string;
  durationLabel: string;
  status: Status;
  recordsIn: number | null;
  recordsOut: number | null;
  errorCount: number;
  message: string;
}> = {}) {
  rowSeq += 1;
  return {
    id: overrides.id ?? `row-${rowSeq}`,
    integrationName: overrides.integrationName ?? "Snowflake ETL Service",
    startedLabel: overrides.startedLabel ?? "Today 09:00",
    durationLabel: overrides.durationLabel ?? "2m 14s",
    status: (overrides.status ?? "SUCCESS") as Status,
    recordsIn: overrides.recordsIn === undefined ? 1_000 : overrides.recordsIn,
    recordsOut: overrides.recordsOut === undefined ? 900 : overrides.recordsOut,
    errorCount: overrides.errorCount ?? 0,
    message: overrides.message ?? "Sync completed",
    color: "bg-blue-500",
    icon: "SF",
    createdAt: new Date("2026-08-25T09:00:00.000Z"),
  };
}

function connection(overrides: Partial<{ name: string; meta: string; status: string }> = {}) {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: overrides.name ?? "Snowflake ETL Service",
    category: "Data Warehouse",
    status: (overrides.status ?? "ERROR") as "CONNECTED" | "ERROR" | "DISCONNECTED" | "PENDING",
    direction: "Inbound",
    lastSyncLabel: "Last: 2h ago",
    recordsIn: 12_000,
    recordsOut: 0,
    meta: overrides.meta ?? "OAuth 2.0",
    color: "bg-blue-500",
    icon: "SF",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-25T09:00:00.000Z"),
  };
}

const goodDiagnosis = {
  diagnosis: "The source system rejected the credential supplied by this integration.",
  likelyCause: "An expired or revoked authentication credential on the source connection.",
  confidence: "medium" as const,
  evidence: ["The run reported 3 errors.", "The recorded message mentions an authentication failure."],
  recommendedActions: ["Check the source credentials for this integration.", "Re-run the sync."],
  insufficientData: false,
};

function completion(payload: unknown) {
  return {
    text: typeof payload === "string" ? payload : JSON.stringify(payload),
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 420,
  };
}

function makeService(options: {
  syncLog?: ReturnType<typeof log> | null;
  relatedLogs?: ReturnType<typeof log>[];
  connectionRow?: ReturnType<typeof connection> | null;
  complete?: ReturnType<typeof vi.fn>;
} = {}) {
  const findUnique = vi.fn().mockResolvedValue(
    options.syncLog === undefined ? log({ id: SYNC_ID }) : options.syncLog,
  );
  const findMany = vi.fn().mockResolvedValue(options.relatedLogs ?? []);
  const findFirst = vi.fn().mockResolvedValue(
    options.connectionRow === undefined ? connection() : options.connectionRow,
  );
  const complete = options.complete ?? vi.fn().mockResolvedValue(completion(goodDiagnosis));

  const prisma = {
    syncLog: { findUnique, findMany },
    connection: { findFirst },
  };
  const llm = { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete };

  const service = new SyncInvestigationService(
    prisma as never,
    llm as never,
    createLogger("error"),
  );

  return { service, complete, findUnique, findMany, findFirst };
}

/** A failure with a described error — the canonical "sufficient" case. */
function failedSync() {
  return log({
    id: SYNC_ID,
    status: "FAILED",
    recordsIn: 0,
    recordsOut: 0,
    errorCount: 3,
    message: "Authentication failed: the source rejected the request",
  });
}

/** Ten prior successes averaging 1000, so a drop is unambiguous. */
function healthyHistory(volume = 1_000, count = 10) {
  return Array.from({ length: count }, () => log({ status: "SUCCESS", recordsIn: volume }));
}

beforeEach(() => {
  rowSeq = 0;
});

describe("SyncInvestigationService", () => {
  describe("failed sync", () => {
    it("diagnoses a described failure through the model", async () => {
      const { service, complete } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).toHaveBeenCalledTimes(1);
      expect(result.source).toBe("ai");
      expect(result.kind).toBe("SYNC_FAILURE");
      expect(result.insufficientData).toBe(false);
      expect(result.likelyCause).toBe(goodDiagnosis.likelyCause);
      expect(result.confidence).toBe("medium");
      expect(result.recommendedActions).toEqual(goodDiagnosis.recommendedActions);
      expect(result.syncLogId).toBe(SYNC_ID);
    });

    it("tells the model it is diagnosing a failure, not a volume drop", async () => {
      const { service, complete } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
      });

      await service.investigate(SYNC_ID);

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("did not complete successfully");
      expect(prompt).toContain("Authentication failed");
    });

    it("instructs the model never to invent evidence or claim certainty", async () => {
      const { service, complete } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
      });

      await service.investigate(SYNC_ID);

      const system = complete.mock.calls[0][0].system as string;
      expect(system).toContain("Analyse ONLY the evidence supplied below");
      expect(system).toContain("Never invent log lines");
      expect(system).toContain("Never claim certainty");
      expect(system).toContain("set `insufficientData` to true");
      expect(system).toContain("Never output, echo, or guess at API keys");
    });
  });

  describe("successful sync with a volume drop", () => {
    it("investigates a technically successful run whose volume collapsed", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 420, message: "Sync completed" }),
        relatedLogs: healthyHistory(),
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).toHaveBeenCalledTimes(1);
      expect(result.kind).toBe("VOLUME_DROP");
      expect(result.volume).toEqual({
        currentVolume: 420,
        historicalAverage: 1_000,
        changePercent: -58,
        sampleCount: 10,
        isAnomalousDrop: true,
      });
    });

    it("hands the model finished statistics rather than a raw series to average", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 420 }),
        relatedLogs: healthyHistory(),
      });

      await service.investigate(SYNC_ID);

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("historical average over 10 previous successful run(s): 1000");
      expect(prompt).toContain("change versus average: -58% (drop)");
      expect(prompt).toContain("moved an unusually low volume");
    });

    it("does not treat a mild dip as an anomaly worth an AI call", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 950 }),
        relatedLogs: healthyHistory(),
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).not.toHaveBeenCalled();
      expect(result.insufficientData).toBe(true);
      expect(result.kind).toBe("NO_ANOMALY");
    });
  });

  describe("insufficient data", () => {
    it("refuses to guess when a failed run carries no error detail, without calling the model", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "FAILED", errorCount: 0, message: "   ", recordsIn: null }),
        relatedLogs: [],
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).not.toHaveBeenCalled();
      expect(result.source).toBe("deterministic");
      expect(result.insufficientData).toBe(true);
      expect(result.likelyCause).toBeNull();
      expect(result.confidence).toBe("low");
      expect(result.diagnosis).toContain("Insufficient data");
      expect(result.insufficientReasons).toContain("NO_ERROR_DETAIL");
      expect(result.recommendedActions.length).toBeGreaterThan(0);
    });

    it("reports no historical volume when a successful run has nothing to compare against", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 420 }),
        relatedLogs: [],
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).not.toHaveBeenCalled();
      expect(result.volume).toBeNull();
      expect(result.insufficientReasons).toContain("NO_HISTORICAL_VOLUME");
      expect(result.evidence.join(" ")).toContain("No comparable historical volume");
    });

    it("refuses a comparison built on too few observations", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 10 }),
        relatedLogs: healthyHistory(1_000, 2),
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).not.toHaveBeenCalled();
      expect(result.volume?.sampleCount).toBe(2);
      expect(result.volume?.isAnomalousDrop).toBe(false);
      expect(result.insufficientReasons).toContain("TOO_FEW_OBSERVATIONS");
    });

    it("treats an empty log history as insufficient rather than as a clean bill of health", async () => {
      const { service, complete } = makeService({
        syncLog: log({ id: SYNC_ID, status: "FAILED", errorCount: 0, message: "" }),
        relatedLogs: [],
        connectionRow: null,
      });

      const result = await service.investigate(SYNC_ID);

      expect(complete).not.toHaveBeenCalled();
      expect(result.insufficientData).toBe(true);
      expect(result.evidenceLogCount).toBe(0);
    });
  });

  describe("lookup", () => {
    it("rejects an unknown sync log id before collecting any evidence", async () => {
      const { service, complete, findMany } = makeService({ syncLog: null });

      await expect(service.investigate(SYNC_ID)).rejects.toMatchObject({
        code: "INTEGRATIONS_SYNC_LOG_NOT_FOUND",
      });
      expect(findMany).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    });

    it("collects evidence for the same integration only, and never mutates anything", async () => {
      const { service, findMany, findFirst } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
      });

      await service.investigate(SYNC_ID);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { integrationName: "Snowflake ETL Service" } }),
      );
      expect(findFirst).toHaveBeenCalledWith({ where: { name: "Snowflake ETL Service" } });
    });
  });

  describe("provider failures", () => {
    it.each([
      ["unavailable", new AiUnavailableError(), "AI_UNAVAILABLE"],
      ["timeout", new AiTimeoutError(), "AI_TIMEOUT"],
    ])("propagates a provider %s as its typed AI error", async (_name, error, code) => {
      const { service } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
        complete: vi.fn().mockRejectedValue(error),
      });

      await expect(service.investigate(SYNC_ID)).rejects.toMatchObject({ code });
    });

    it.each([
      ["empty text", ""],
      ["prose with no JSON", "I think the token expired."],
      ["unparseable JSON", "{ diagnosis: "],
      ["a valid object of the wrong shape", JSON.stringify({ rootCause: "token expired" })],
      ["an out-of-range confidence", JSON.stringify({ ...goodDiagnosis, confidence: "certain" })],
      ["an unexpected extra field", JSON.stringify({ ...goodDiagnosis, autoRetry: true })],
    ])("rejects %s rather than passing it on", async (_name, text) => {
      const { service } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
        complete: vi.fn().mockResolvedValue(completion(text)),
      });

      await expect(service.investigate(SYNC_ID)).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("accepts a well-formed object wrapped in a code fence", async () => {
      const { service } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
        complete: vi
          .fn()
          .mockResolvedValue(completion("```json\n" + JSON.stringify(goodDiagnosis) + "\n```")),
      });

      await expect(service.investigate(SYNC_ID)).resolves.toMatchObject({
        likelyCause: goodDiagnosis.likelyCause,
      });
    });
  });

  describe("output guardrails", () => {
    it("drops a named cause when the model also declared the data insufficient", async () => {
      const { service } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
        complete: vi.fn().mockResolvedValue(
          completion({
            ...goodDiagnosis,
            insufficientData: true,
            confidence: "high",
            likelyCause: "The API token definitely expired.",
          }),
        ),
      });

      const result = await service.investigate(SYNC_ID);

      expect(result.insufficientData).toBe(true);
      expect(result.likelyCause).toBeNull();
      expect(result.confidence).toBe("low");
    });

    it("demotes a confident answer that cites no evidence", async () => {
      const { service } = makeService({
        syncLog: failedSync(),
        relatedLogs: healthyHistory(),
        complete: vi
          .fn()
          .mockResolvedValue(completion({ ...goodDiagnosis, evidence: [], confidence: "high" })),
      });

      await expect(service.investigate(SYNC_ID)).resolves.toMatchObject({ confidence: "low" });
    });

    it("leaves a well-supported answer untouched", () => {
      expect(applyDiagnosisGuardrails(goodDiagnosis)).toEqual(goodDiagnosis);
    });
  });

  describe("evidence bounds and redaction", () => {
    it("never sends more than the related-log cap to the model", async () => {
      const { service, complete } = makeService({
        syncLog: failedSync(),
        relatedLogs: Array.from({ length: 40 }, (_, index) =>
          log({ status: "SUCCESS", recordsIn: 1_000, startedLabel: `Run ${index}` }),
        ),
      });

      await service.investigate(SYNC_ID);

      const prompt = complete.mock.calls[0][0].prompt as string;
      const listed = prompt.split("\n").filter((line) => line.startsWith("- ")).length;
      expect(listed).toBe(MAX_RELATED_LOGS);
      expect(prompt).not.toContain("Run 20");
    });

    it("truncates an oversized error message before it reaches the provider", async () => {
      const { service, complete } = makeService({
        syncLog: log({
          id: SYNC_ID,
          status: "FAILED",
          errorCount: 1,
          message: `Stack trace: ${"x".repeat(20_000)}`,
        }),
        relatedLogs: healthyHistory(),
      });

      await service.investigate(SYNC_ID);

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("(truncated,");
      expect(prompt).not.toContain("x".repeat(MAX_MESSAGE_LENGTH + 1));
    });

    it("redacts credentials embedded in sync messages and connection metadata", async () => {
      const { service, complete } = makeService({
        syncLog: log({
          id: SYNC_ID,
          status: "FAILED",
          errorCount: 1,
          message:
            'Rejected: Authorization: Bearer abcdefghijklmnop1234, api_key="sk-live-supersecretvalue", db postgres://admin:hunter2@warehouse.internal',
        }),
        relatedLogs: healthyHistory(),
        connectionRow: connection({ meta: "OAuth 2.0 client_secret=zzzzzzzzzzzzzzzz" }),
      });

      await service.investigate(SYNC_ID);

      const request = complete.mock.calls[0][0];
      const sent = `${request.system}\n${request.prompt}`;

      expect(sent).not.toContain("abcdefghijklmnop1234");
      expect(sent).not.toContain("sk-live-supersecretvalue");
      expect(sent).not.toContain("hunter2");
      expect(sent).not.toContain("zzzzzzzzzzzzzzzz");
      expect(sent).toContain("[REDACTED]");
      // The diagnostic signal survives: the reader can still see that an
      // authentication value was present, just not what it was.
      expect(sent.toLowerCase()).toContain("authorization=[redacted]");
    });

    it("never reads an API key, webhook, or credential table while investigating", async () => {
      const findUnique = vi.fn().mockResolvedValue(failedSync());
      const findMany = vi.fn().mockResolvedValue(healthyHistory());
      const findFirst = vi.fn().mockResolvedValue(connection());
      const apiKeyFindMany = vi.fn();
      const prisma = {
        syncLog: { findUnique, findMany },
        connection: { findFirst },
        apiKey: { findMany: apiKeyFindMany },
        webhook: { findMany: vi.fn() },
      };
      const service = new SyncInvestigationService(
        prisma as never,
        { name: "anthropic", model: "m", isConfigured: true, complete: vi.fn().mockResolvedValue(completion(goodDiagnosis)) } as never,
        createLogger("error"),
      );

      await service.investigate(SYNC_ID);

      expect(apiKeyFindMany).not.toHaveBeenCalled();
      expect(prisma.webhook.findMany).not.toHaveBeenCalled();
    });
  });
});

describe("deterministic volume analysis", () => {
  it("averages only previous successful runs of the same integration", () => {
    const current = log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 500 });
    const history = [
      log({ status: "SUCCESS", recordsIn: 1_000 }),
      log({ status: "FAILED", recordsIn: 0 }),
      log({ status: "SUCCESS", recordsIn: 1_200 }),
      log({ status: "SUCCESS", recordsIn: 800 }),
      log({ status: "RUNNING", recordsIn: null }),
    ];

    const volume = analyseVolume(current, history);

    expect(volume).toMatchObject({
      currentVolume: 500,
      historicalAverage: 1_000,
      historicalMinimum: 800,
      historicalMaximum: 1_200,
      sampleCount: 3,
      changePercent: -50,
      isAnomalousDrop: true,
    });
  });

  it("excludes the run under investigation from its own baseline", () => {
    const current = log({ id: SYNC_ID, status: "SUCCESS", recordsIn: 100 });
    const volume = analyseVolume(current, [current, log({ status: "SUCCESS", recordsIn: 1_000 })]);

    expect(volume?.sampleCount).toBe(1);
    expect(volume?.historicalAverage).toBe(1_000);
  });

  it("returns null when the run recorded no inbound volume at all", () => {
    expect(analyseVolume(log({ recordsIn: null }), healthyHistory())).toBeNull();
  });

  it("returns null when there is no successful history to compare against", () => {
    expect(analyseVolume(log({ recordsIn: 100 }), [log({ status: "FAILED", recordsIn: 0 })])).toBeNull();
  });

  it("does not flag an increase as an anomalous drop", () => {
    const volume = analyseVolume(log({ id: OTHER_ID, recordsIn: 3_000 }), healthyHistory());

    expect(volume?.changePercent).toBe(200);
    expect(volume?.isAnomalousDrop).toBe(false);
  });
});

describe("evidence sufficiency", () => {
  it("counts a failing neighbour's described error as evidence for a bare failure", () => {
    const evidence = buildInvestigationEvidence({
      syncLog: log({ id: SYNC_ID, status: "FAILED", errorCount: 0, message: "" }),
      relatedLogs: [log({ status: "FAILED", errorCount: 5, message: "Connection timed out" })],
      connection: null,
    });

    expect(evidence.hasErrorEvidence).toBe(true);
    expect(evidence.isSufficient).toBe(true);
    expect(evidence.kind).toBe("SYNC_FAILURE");
  });

  it("does not treat a healthy neighbour history as failure evidence", () => {
    const evidence = buildInvestigationEvidence({
      syncLog: log({ id: SYNC_ID, status: "FAILED", errorCount: 0, message: "" }),
      relatedLogs: [log({ status: "SUCCESS", recordsIn: 1_000 })],
      connection: null,
    });

    expect(evidence.hasErrorEvidence).toBe(false);
    expect(evidence.isSufficient).toBe(false);
  });
});

describe("sanitiseText", () => {
  it("collapses whitespace and leaves ordinary operational text intact", () => {
    expect(sanitiseText("  Sync   completed\nwith 0 errors ")).toBe("Sync completed with 0 errors");
  });

  it("redacts every credential shape it knows about", () => {
    const redacted = sanitiseText(
      'Bearer abcdefghijklmnop token=abcdef123456 password: hunter2hunter2 eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM',
      2_000,
    );

    expect(redacted).not.toContain("abcdefghijklmnop");
    expect(redacted).not.toContain("abcdef123456");
    expect(redacted).not.toContain("hunter2hunter2");
    expect(redacted).not.toContain("SflKxwRJSM");
  });

  it("truncates at the requested bound and says it did", () => {
    const redacted = sanitiseText("y".repeat(1_000));

    expect(redacted.startsWith("y".repeat(MAX_MESSAGE_LENGTH))).toBe(true);
    expect(redacted).toContain("(truncated, 1000 characters total)");
  });
});
