import { describe, expect, it, vi } from "vitest";

import { AiAudioBriefService } from "../../src/modules/ai/audio-brief.service";
import { AiMalformedOutputError, AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";

/**
 * This service is the whole Task 6 pipeline: gather real data, select what
 * matters deterministically, ask OpenAI for a grounded English script,
 * validate it, then convert it to speech with OpenAI TTS. Everything here
 * is mocked at the service boundary — no network call, no real provider.
 */

function activeKpi(id: string, nameEn: string) {
  return {
    definition: { id, activeVersionId: `${id}-v1`, status: "active" as const, retiredAt: null, createdAt: new Date(), updatedAt: new Date() },
    version: { id: `${id}-v1`, kpiDefinitionId: id, version: 1, nameEn, nameAr: nameEn, descriptionEn: null, descriptionAr: null, unit: "%", polarity: "higher_is_better" as const, frequency: "monthly" as const, dataSourceType: "manual" as const, calculationLogicText: null, ownerUserId: "owner-1", stewardUserId: null, activeFrom: new Date(), supersedesVersionId: null, approvalCaseId: null, publishedAt: new Date(), createdAt: new Date() },
  };
}

function kpiDetail(definitionId: string, nameEn: string, options: { status: string; actual: number; target: number | null; polarity?: "higher_is_better" | "lower_is_better" }) {
  return {
    definition: { id: definitionId, status: "active", retiredAt: null },
    version: { id: `${definitionId}-v1`, version: 1, nameEn, nameAr: nameEn, descriptionEn: null, descriptionAr: null, unit: "%", polarity: options.polarity ?? "higher_is_better", frequency: "monthly", dataSourceType: "manual", ownerUserId: "owner-1", ownerName: "Owner", publishedAt: new Date() },
    scopeNodeId: "scope-1",
    period: "2026-08",
    targets: options.target === null ? [] : [{ id: "target-1", scopeNodeId: "scope-1", period: "2026-08", targetValue: options.target, planVersionId: "plan-1" }],
    measurements: [{ id: "m1", scopeNodeId: "scope-1", period: "2026-08", value: options.actual, createdAt: new Date("2026-08-01") }],
    statuses: [{ id: "s1", scopeNodeId: "scope-1", period: "2026-08", status: options.status, computedAt: new Date(), ruleVersionUsed: "rule-1" }],
    rollups: [],
    contributors: [],
    commentary: [],
    alignments: [],
    thresholdBinding: null,
  };
}

function makeDeps(overrides: {
  kpis?: unknown[];
  kpiDetails?: Record<string, ReturnType<typeof kpiDetail> | null>;
  okrs?: unknown[];
  initiatives?: unknown[];
  complete?: ReturnType<typeof vi.fn>;
  synthesize?: ReturnType<typeof vi.fn>;
} = {}) {
  const kpis = {
    list: vi.fn().mockResolvedValue(overrides.kpis ?? []),
  };
  const okrs = {
    list: vi.fn().mockResolvedValue(overrides.okrs ?? []),
  };
  const execution = {
    list: vi.fn().mockResolvedValue(overrides.initiatives ?? []),
  };
  const performance = {
    getKpiDetail: vi.fn((id: string) => Promise.resolve(overrides.kpiDetails?.[id] ?? null)),
  };
  const complete =
    overrides.complete ??
    vi.fn().mockResolvedValue({
      text: JSON.stringify({ title: "Executive Audio Brief", script: "Here is your executive briefing. Revenue Growth is off track." }),
      provider: "openai",
      model: "gpt-4o-mini",
      latencyMs: 100,
    });
  const llm = { name: "openai", model: "gpt-4o-mini", isConfigured: true, complete };
  const synthesize =
    overrides.synthesize ??
    vi.fn().mockResolvedValue({
      audio: Buffer.from("fake-mp3-bytes"),
      mimeType: "audio/mpeg",
      provider: "openai",
      model: "tts-1",
      latencyMs: 50,
    });
  const tts = { name: "openai", isConfigured: true, synthesize };

  const service = new AiAudioBriefService(
    kpis as never,
    okrs as never,
    execution as never,
    performance as never,
    llm as never,
    tts as never,
    "tts-1",
    "onyx",
    createLogger("error"),
  );

  return { service, kpis, okrs, execution, performance, complete, synthesize };
}

describe("AiAudioBriefService", () => {
  describe("authorization and data retrieval", () => {
    it("retrieves current report data scoped to the requesting actor", async () => {
      const { service, execution } = makeDeps();

      await service.generate("actor-1");

      expect(execution.list).toHaveBeenCalledWith({ scope: "all", actorUserId: "actor-1" });
    });

    it("only sends the LLM the deterministically selected items, never raw report data", async () => {
      const kpiA = activeKpi("kpi-a", "Revenue Growth");
      const kpiB = activeKpi("kpi-b", "Customer Retention");
      const { service, complete } = makeDeps({
        kpis: [kpiA, kpiB],
        kpiDetails: {
          "kpi-a": kpiDetail("kpi-a", "Revenue Growth", { status: "off_track", actual: 82, target: 100 }),
          "kpi-b": kpiDetail("kpi-b", "Customer Retention", { status: "on_track", actual: 100, target: 100 }),
        },
      });

      await service.generate("actor-1");

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("Revenue Growth");
      expect(prompt).not.toContain("Customer Retention");
    });
  });

  describe("significance prioritisation", () => {
    it("prioritises an at-risk KPI into the brief", async () => {
      const kpiA = activeKpi("kpi-a", "Revenue Growth");
      const { service } = makeDeps({
        kpis: [kpiA],
        kpiDetails: {
          "kpi-a": kpiDetail("kpi-a", "Revenue Growth", { status: "watch", actual: 94, target: 100 }),
        },
      });

      const result = await service.generate("actor-1");

      expect(result.items).toEqual([
        expect.objectContaining({ type: "kpi", name: "Revenue Growth", importance: "medium" }),
      ]);
    });

    it("prioritises an off-track initiative into the brief", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
      });

      const result = await service.generate("actor-1");

      expect(result.items).toEqual([
        expect.objectContaining({ type: "initiative", name: "Digital Transformation", importance: "critical" }),
      ]);
    });

    it("prioritises a large negative KPI change into the brief", async () => {
      const kpiA = activeKpi("kpi-a", "Revenue Growth");
      const detail = kpiDetail("kpi-a", "Revenue Growth", { status: "on_track", actual: 80, target: null });
      detail.measurements = [
        { id: "m0", scopeNodeId: "scope-1", period: "2026-07", value: 100, createdAt: new Date("2026-07-01") },
        { id: "m1", scopeNodeId: "scope-1", period: "2026-08", value: 80, createdAt: new Date("2026-08-01") },
      ];
      const { service } = makeDeps({ kpis: [kpiA], kpiDetails: { "kpi-a": detail } });

      const result = await service.generate("actor-1");

      expect(result.items).toEqual([
        expect.objectContaining({ type: "kpi", name: "Revenue Growth", importance: "medium" }),
      ]);
    });

    it("can include a positive achievement alongside problems", async () => {
      const kpiA = activeKpi("kpi-a", "Revenue Growth");
      const kpiB = activeKpi("kpi-b", "Operational Efficiency");
      const { service } = makeDeps({
        kpis: [kpiA, kpiB],
        kpiDetails: {
          "kpi-a": kpiDetail("kpi-a", "Revenue Growth", { status: "off_track", actual: 82, target: 100 }),
          "kpi-b": kpiDetail("kpi-b", "Operational Efficiency", { status: "on_track", actual: 130, target: 100 }),
        },
      });

      const result = await service.generate("actor-1");

      expect(result.items.map((item) => item.importance)).toEqual(["critical", "positive"]);
    });
  });

  describe("script generation and validation", () => {
    it("sends the validated English script to text-to-speech", async () => {
      const { service, synthesize } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
      });

      const result = await service.generate("actor-1");

      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Here is your executive briefing. Revenue Growth is off track." }),
      );
      expect(result.audioBase64).toBe(Buffer.from("fake-mp3-bytes").toString("base64"));
    });

    it("requires English-only output in the prompt", async () => {
      const { service, complete } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
      });

      await service.generate("actor-1");

      const request = complete.mock.calls[0][0];
      expect(request.system).toContain("English only");
      expect(request.system).toContain("Do not write any Arabic text");
    });

    it("rejects a response that is not valid JSON", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        complete: vi.fn().mockResolvedValue({ text: "not json at all", provider: "openai", model: "gpt-4o-mini", latencyMs: 10 }),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a script containing Arabic text", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        complete: vi.fn().mockResolvedValue({
          text: JSON.stringify({ title: "Executive Audio Brief", script: "مرحبا، هذا هو ملخصك التنفيذي لهذه الفترة وهو طويل بما فيه الكفاية." }),
          provider: "openai",
          model: "gpt-4o-mini",
          latencyMs: 10,
        }),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a script missing required fields", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        complete: vi.fn().mockResolvedValue({ text: JSON.stringify({ title: "Executive Audio Brief" }), provider: "openai", model: "gpt-4o-mini", latencyMs: 10 }),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiMalformedOutputError);
    });
  });

  describe("empty data", () => {
    it("returns a controlled English message and skips the LLM call when nothing is significant", async () => {
      const { service, complete, synthesize } = makeDeps();

      const result = await service.generate("actor-1");

      expect(complete).not.toHaveBeenCalled();
      expect(result.items).toEqual([]);
      expect(result.script).toBe("No significant executive updates are available for this reporting period.");
      expect(synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ text: "No significant executive updates are available for this reporting period." }),
      );
    });
  });

  describe("provider failures", () => {
    it("normalises an OpenAI script generation failure", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        complete: vi.fn().mockRejectedValue(new AiUnavailableError()),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiUnavailableError);
    });

    it("normalises a script generation timeout", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        complete: vi.fn().mockRejectedValue(new AiTimeoutError()),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiTimeoutError);
    });

    it("propagates a text-to-speech failure without a malformed-output error", async () => {
      const { service } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
        synthesize: vi.fn().mockRejectedValue(new AiUnavailableError("Text-to-speech is unavailable right now")),
      });

      await expect(service.generate("actor-1")).rejects.toBeInstanceOf(AiUnavailableError);
    });

  });

  describe("future role parameter", () => {
    it("accepts an optional role without changing V1 output", async () => {
      const { service: withRole } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
      });
      const { service: withoutRole } = makeDeps({
        initiatives: [{ id: "init-1", nameEn: "Digital Transformation", latestStatus: "off_track" }],
      });

      const resultWithRole = await withRole.generate("actor-1", "cfo");
      const resultWithoutRole = await withoutRole.generate("actor-1");

      expect(resultWithRole.script).toBe(resultWithoutRole.script);
      expect(resultWithRole.items).toEqual(resultWithoutRole.items);
    });
  });
});
