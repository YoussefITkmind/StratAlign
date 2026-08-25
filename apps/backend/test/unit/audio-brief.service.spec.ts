import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiMalformedOutputError,
  AiTimeoutError,
  AiUnavailableError,
} from "../../src/modules/ai/ai.errors";
import { AudioBriefService } from "../../src/modules/ai/audio-brief.service";
import { NO_SIGNIFICANT_DATA_SCRIPT } from "../../src/modules/ai/audio-brief.prompt";
import type { AudioBriefDataSources } from "../../src/modules/ai/audio-brief.types";
import { createLogger } from "../../src/logging/logger";

/**
 * The audio brief end to end, with both providers stubbed — a unit test must
 * never make a paid call.
 *
 * The assertions that matter most are the negative ones: that the full
 * dashboard never reaches the model, that an Arabic script never reaches
 * text-to-speech, and that an empty data set produces the fixed message
 * instead of a model-authored one.
 */

const logger = createLogger("error");

const KPI_ID = "11111111-1111-4111-8111-111111111111";
const OKR_ID = "22222222-2222-4222-8222-222222222222";
const INITIATIVE_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

const complete = vi.fn();
const synthesize = vi.fn();

const llm = {
  name: "openai",
  model: "gpt-4o-mini",
  isConfigured: true,
  complete,
};

const tts = {
  name: "openai",
  model: "gpt-4o-mini-tts",
  voice: "alloy",
  isConfigured: true,
  synthesize,
};

function kpiDetail(overrides: {
  value?: number;
  previousValue?: number;
  targetValue?: number;
  status?: string;
} = {}) {
  const value = overrides.value ?? 40;
  const previousValue = overrides.previousValue ?? 90;
  return {
    period: "2026-Q1",
    targets: [
      {
        scopeNodeId: "scope-1",
        period: "2026-Q1",
        targetValue: overrides.targetValue ?? 100,
      },
    ],
    measurements: [
      {
        scopeNodeId: "scope-1",
        period: "2025-Q4",
        value: previousValue,
        createdAt: new Date("2025-12-31T00:00:00.000Z"),
      },
      {
        scopeNodeId: "scope-1",
        period: "2026-Q1",
        value,
        createdAt: new Date("2026-03-31T00:00:00.000Z"),
      },
    ],
    statuses: [
      {
        scopeNodeId: "scope-1",
        period: "2026-Q1",
        status: overrides.status ?? "off_track",
      },
    ],
  };
}

function sources(overrides: Partial<AudioBriefDataSources> = {}): AudioBriefDataSources {
  return {
    kpiRegistry: {
      list: vi.fn().mockResolvedValue([
        {
          definition: { id: KPI_ID, status: "active" },
          version: { nameEn: "Revenue Growth", unit: "%", polarity: "higher_is_better" },
        },
      ]),
    },
    performance: {
      getKpiDetail: vi.fn().mockResolvedValue(kpiDetail()),
    },
    okrRegistry: {
      list: vi.fn().mockResolvedValue([
        {
          id: OKR_ID,
          nameEn: "Grow the core business",
          keyResults: [{ progressPercent: 20 }, { progressPercent: 30 }],
        },
      ]),
    },
    execution: {
      list: vi.fn().mockResolvedValue([
        {
          id: INITIATIVE_ID,
          nameEn: "Billing platform migration",
          stage: "execute",
          latestStatus: "off_track",
          latestConfidence: "low",
        },
      ]),
    },
    ...overrides,
  };
}

function emptySources(): AudioBriefDataSources {
  return {
    kpiRegistry: { list: vi.fn().mockResolvedValue([]) },
    performance: { getKpiDetail: vi.fn().mockResolvedValue(null) },
    okrRegistry: { list: vi.fn().mockResolvedValue([]) },
    execution: { list: vi.fn().mockResolvedValue([]) },
  };
}

function service(data: AudioBriefDataSources = sources()) {
  return new AudioBriefService(data, llm, tts, logger);
}

describe("AudioBriefService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    complete.mockResolvedValue({
      text: JSON.stringify({
        title: "Executive Brief",
        script: "Revenue Growth is off track at forty percent against a target of one hundred.",
      }),
      provider: "openai",
      model: "gpt-4o-mini",
      latencyMs: 120,
    });
    synthesize.mockResolvedValue({
      audio: Buffer.from("fake-mp3-bytes"),
      contentType: "audio/mpeg",
      format: "mp3",
      provider: "openai",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      latencyMs: 300,
    });
  });

  it("gathers KPI, OKR, and initiative data from the existing domain services", async () => {
    const data = sources();

    await service(data).generate({ actorUserId: ACTOR_ID });

    expect(data.kpiRegistry.list).toHaveBeenCalledTimes(1);
    expect(data.performance.getKpiDetail).toHaveBeenCalledWith(KPI_ID);
    expect(data.okrRegistry.list).toHaveBeenCalledTimes(1);
    expect(data.execution.list).toHaveBeenCalledWith({ scope: "all", actorUserId: ACTOR_ID });
  });

  it("sends only the selected significant items to the model, not the raw data set", async () => {
    const data = sources({
      kpiRegistry: {
        list: vi.fn().mockResolvedValue([
          {
            definition: { id: KPI_ID, status: "active" },
            version: { nameEn: "Revenue Growth", unit: "%", polarity: "higher_is_better" },
          },
          {
            definition: { id: "healthy", status: "active" },
            version: { nameEn: "Boringly Stable KPI", unit: "%", polarity: "higher_is_better" },
          },
        ]),
      },
      performance: {
        getKpiDetail: vi.fn().mockImplementation((id: string) =>
          Promise.resolve(
            id === KPI_ID
              ? kpiDetail()
              : kpiDetail({ value: 100, previousValue: 100, targetValue: 100, status: "on_track" }),
          ),
        ),
      },
    });

    await service(data).generate({ actorUserId: ACTOR_ID });

    const prompt = complete.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Revenue Growth");
    expect(prompt).toContain("Grow the core business");
    expect(prompt).toContain("Billing platform migration");
    expect(prompt).not.toContain("Boringly Stable KPI");
  });

  it("instructs the model to write English only", async () => {
    await service().generate({ actorUserId: ACTOR_ID });

    const system = complete.mock.calls[0][0].system as string;
    expect(system).toContain("English only");
    expect(system).toContain("Never write Arabic");
  });

  it("returns the validated script and the synthesised audio as base64", async () => {
    const result = await service().generate({ actorUserId: ACTOR_ID });

    expect(result.title).toBe("Executive Brief");
    expect(result.insufficientData).toBe(false);
    expect(result.audio).toEqual({
      base64: Buffer.from("fake-mp3-bytes").toString("base64"),
      contentType: "audio/mpeg",
      format: "mp3",
    });
    expect(synthesize).toHaveBeenCalledWith({
      text: result.script,
      feature: "ai.audio-brief",
    });
  });

  it("accepts an optional role without changing the v1 result", async () => {
    const withRole = await service().generate({ actorUserId: ACTOR_ID, role: "executive_viewer" });
    const withoutRole = await service().generate({ actorUserId: ACTOR_ID });

    expect(withRole.script).toBe(withoutRole.script);
  });

  it("uses the fixed message and never calls the model when nothing is significant", async () => {
    const result = await service(emptySources()).generate({ actorUserId: ACTOR_ID });

    expect(result.insufficientData).toBe(true);
    expect(result.script).toBe(NO_SIGNIFICANT_DATA_SCRIPT);
    expect(complete).not.toHaveBeenCalled();
    // Still spoken: the executive gets an answer, just not an invented one.
    expect(synthesize).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a script containing Arabic", { title: "Executive Brief", script: "الوضع الحالي جيد" }],
    ["a title containing Arabic", { title: "موجز", script: "Revenue Growth is off track." }],
  ])("rejects %s and never sends it to text-to-speech", async (_label, payload) => {
    complete.mockResolvedValue({
      text: JSON.stringify(payload),
      provider: "openai",
      model: "gpt-4o-mini",
      latencyMs: 100,
    });

    await expect(service().generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
      AiMalformedOutputError,
    );
    expect(synthesize).not.toHaveBeenCalled();
  });

  it.each([
    ["prose instead of JSON", "Here is your briefing, sir."],
    ["JSON missing the script field", '{"title":"Executive Brief"}'],
    ["JSON with an unexpected extra field", '{"title":"T","script":"S","tone":"grave"}'],
    ["an empty response", "   "],
    ["an empty script", '{"title":"Executive Brief","script":""}'],
  ])("rejects %s as malformed output", async (_label, text) => {
    complete.mockResolvedValue({ text, provider: "openai", model: "gpt-4o-mini", latencyMs: 10 });

    await expect(service().generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
      AiMalformedOutputError,
    );
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("rejects a script longer than the spoken-length ceiling", async () => {
    complete.mockResolvedValue({
      text: JSON.stringify({ title: "Executive Brief", script: "a".repeat(1_401) }),
      provider: "openai",
      model: "gpt-4o-mini",
      latencyMs: 10,
    });

    await expect(service().generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
      AiMalformedOutputError,
    );
  });

  it.each([
    [new AiUnavailableError(), AiUnavailableError],
    [new AiTimeoutError(), AiTimeoutError],
  ])("propagates a model failure unchanged", async (thrown, expected) => {
    complete.mockRejectedValue(thrown);

    await expect(service().generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(expected);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it("propagates a text-to-speech failure unchanged", async () => {
    synthesize.mockRejectedValue(new AiUnavailableError());

    await expect(service().generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});
