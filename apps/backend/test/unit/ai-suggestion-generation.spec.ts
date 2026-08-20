import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiSuggestionService } from "../../src/modules/ai/ai-suggestion.service";
import {
  AiMalformedOutputError,
  AiTimeoutError,
  AiUnavailableError,
} from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";
import type { ThemeSuggestionContext } from "../../src/modules/ai/ai-suggestion.types";

/**
 * Generation is the boundary where untrusted model text becomes a typed
 * proposal. These tests hold that boundary: valid structure passes, anything
 * else is refused outright, and no candidate that survives has been scored or
 * de-duplicated by anything other than the registry's own trigram search.
 *
 * The provider is always a stub. A deterministic test must never spend money
 * or depend on a live model's mood.
 */

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_OBJECTIVE_ID = "55555555-5555-4555-8555-555555555555";
const KPI_ID = "44444444-4444-4444-8444-444444444444";

const context: ThemeSuggestionContext = {
  theme: { id: THEME_ID, nameEn: "Revenue & Growth", nameAr: "الإيرادات", type: "theme" },
  ancestry: [
    { id: "root", nameEn: "Corporate Strategy", nameAr: "الاستراتيجية", type: "corporate_strategy" },
  ],
  objectives: [
    { id: OBJECTIVE_ID, nameEn: "Achieve $60M ARR", nameAr: "ARR", type: "objective" },
  ],
  existingOkrs: [
    {
      id: "okr-1",
      objectiveNodeId: OBJECTIVE_ID,
      nameEn: "Drive Revenue Growth 40% YoY",
      nameAr: "نمو",
      keyResults: [],
    },
  ],
  existingKpis: [
    {
      kpiDefinitionId: KPI_ID,
      nameEn: "Customer Retention Rate",
      nameAr: "معدل",
      descriptionEn: null,
      unit: "%",
      frequency: "monthly",
      polarity: "higher_is_better",
    },
  ],
};

const validKpi = {
  type: "kpi",
  titleEn: "LTV to CAC Ratio",
  titleAr: "نسبة",
  descriptionEn: "Efficiency of acquisition against long-term value.",
  descriptionAr: "الكفاءة",
  confidence: 0.91,
  rationale: "No efficiency measure exists for this theme.",
  unit: "x",
  frequency: "quarterly",
  polarity: "higher_is_better",
};

const validOkr = {
  type: "okr",
  titleEn: "Expand into enterprise accounts",
  titleAr: "التوسع",
  descriptionEn: null,
  descriptionAr: null,
  confidence: 0.72,
  rationale: null,
  objectiveNodeId: OBJECTIVE_ID,
  keyResults: [
    {
      titleEn: "Sign 20 enterprise logos",
      titleAr: "توقيع",
      type: "quantitative",
      targetValue: 20,
      unit: "logos",
    },
  ],
};

function completion(payload: unknown) {
  return {
    text: typeof payload === "string" ? payload : JSON.stringify(payload),
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 1234,
  };
}

function makeService(overrides: {
  complete?: ReturnType<typeof vi.fn>;
  findSimilar?: ReturnType<typeof vi.fn>;
} = {}) {
  const complete = overrides.complete ?? vi.fn().mockResolvedValue(completion({ suggestions: [] }));
  const findSimilar = overrides.findSimilar ?? vi.fn().mockResolvedValue([]);
  const build = vi.fn().mockResolvedValue(context);

  const service = new AiSuggestionService(
    {} as never,
    { build } as never,
    { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete } as never,
    { findSimilar } as never,
    {} as never,
    {} as never,
    {} as never,
    createLogger("error"),
  );

  return { service, complete, findSimilar, build };
}

describe("AI suggestion generation", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("prompting", () => {
    it("passes the theme, hierarchy, existing OKRs, and existing KPIs to the model", async () => {
      const { service, complete } = makeService();

      await service.generate({ themeNodeId: THEME_ID, kinds: ["kpi", "okr"], maxSuggestions: 8 });

      const request = complete.mock.calls[0][0];
      expect(request.prompt).toContain("Revenue & Growth");
      expect(request.prompt).toContain("Corporate Strategy");
      expect(request.prompt).toContain("Drive Revenue Growth 40% YoY");
      expect(request.prompt).toContain("Customer Retention Rate");
      // The objective's id is the only legal anchor, so it must be in the prompt.
      expect(request.prompt).toContain(OBJECTIVE_ID);
      expect(request.feature).toBe("registry.ai-suggestion.theme");
      expect(request.system).toContain("never create, modify, or delete");
    });

    it("tells the model not to propose OKRs when the theme has no objectives", async () => {
      const { service, complete, build } = makeService();
      build.mockResolvedValue({ ...context, objectives: [] });

      await service.generate({ themeNodeId: THEME_ID, kinds: ["kpi", "okr"], maxSuggestions: 8 });

      expect(complete.mock.calls[0][0].prompt).toContain(
        "do not propose any OKR",
      );
    });
  });

  describe("structured output", () => {
    it("accepts a well-formed response and returns every suggestion", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [validKpi, validOkr] }),
        ),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi", "okr"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions).toHaveLength(2);
      expect(batch.provider).toBe("anthropic");
      expect(batch.model).toBe("claude-sonnet-5");
      expect(batch.latencyMs).toBe(1234);
      // Each proposal gets its own idempotency key, minted server-side.
      const ids = new Set(batch.suggestions.map((s) => s.suggestionId));
      expect(ids.size).toBe(2);
      expect(batch.suggestions.every((s) => s.generationId === batch.generationId)).toBe(true);
    });

    it("maps KPI-specific fields onto the KPI branch only", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ suggestions: [validKpi] })),
      });

      const [suggestion] = (
        await service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 })
      ).suggestions;

      expect(suggestion.kind).toBe("kpi");
      expect(suggestion.kpi).toEqual({
        unit: "x",
        frequency: "quarterly",
        polarity: "higher_is_better",
      });
      expect(suggestion.okr).toBeNull();
    });

    it("maps the objective and key results onto the OKR branch only", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ suggestions: [validOkr] })),
      });

      const [suggestion] = (
        await service.generate({ themeNodeId: THEME_ID, kinds: ["okr"], maxSuggestions: 8 })
      ).suggestions;

      expect(suggestion.kpi).toBeNull();
      expect(suggestion.okr?.objectiveNodeId).toBe(OBJECTIVE_ID);
      expect(suggestion.okr?.keyResults).toEqual([
        {
          titleEn: "Sign 20 enterprise logos",
          titleAr: "توقيع",
          type: "quantitative",
          targetValue: 20,
          unit: "logos",
        },
      ]);
    });

    it("tolerates a fenced or prose-wrapped JSON object", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion(
            "Here you go:\n```json\n" +
              JSON.stringify({ suggestions: [validKpi] }) +
              "\n```\nHope that helps.",
          ),
        ),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions).toHaveLength(1);
    });

    it("returns an empty batch when the model genuinely proposes nothing", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ suggestions: [] })),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions).toEqual([]);
    });

    it("rejects output that is not JSON at all", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion("I would suggest tracking ARR.")),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects an entirely empty completion", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion("   ")),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a confidence outside the agreed 0-1 range", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [{ ...validKpi, confidence: 91 }] }),
        ),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a KPI missing the fields the registry requires", async () => {
      for (const missing of ["unit", "frequency", "polarity"] as const) {
        const broken = { ...validKpi, [missing]: undefined };
        const { service } = makeService({
          complete: vi.fn().mockResolvedValue(completion({ suggestions: [broken] })),
        });

        await expect(
          service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
        ).rejects.toBeInstanceOf(AiMalformedOutputError);
      }
    });

    it("rejects a frequency or polarity outside the domain enum", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [{ ...validKpi, frequency: "weekly" }] }),
        ),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects an OKR with no key results, as OkrService would", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [{ ...validOkr, keyResults: [] }] }),
        ),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["okr"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a key result with a non-finite target", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion(
            '{"suggestions":[{"type":"okr","titleEn":"x","titleAr":"س","confidence":0.5,' +
              `"objectiveNodeId":"${OBJECTIVE_ID}",` +
              '"keyResults":[{"titleEn":"a","titleAr":"ب","type":"quantitative","targetValue":"lots","unit":"%"}]}]}',
          ),
        ),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["okr"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("does not leak model output into the error a caller sees", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [{ ...validKpi, confidence: 91 }] }),
        ),
      });

      const failure = await service
        .generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 })
        .catch((error: unknown) => error as Error);

      expect(failure.message).toBe("The AI response could not be understood");
      expect(failure.message).not.toContain("LTV");
    });
  });

  describe("scoping", () => {
    it("drops an OKR anchored to an objective outside this theme", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({
            suggestions: [
              { ...validOkr, objectiveNodeId: OTHER_OBJECTIVE_ID },
              validKpi,
            ],
          }),
        ),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi", "okr"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions).toHaveLength(1);
      expect(batch.suggestions[0].kind).toBe("kpi");
    });

    it("drops a kind the caller did not ask for", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({ suggestions: [validKpi, validOkr] }),
        ),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["okr"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions.map((s) => s.kind)).toEqual(["okr"]);
    });
  });

  describe("duplicate detection", () => {
    it("flags a near-duplicate KPI using the registry's own similarity search", async () => {
      const findSimilar = vi.fn().mockResolvedValue([
        {
          kpiDefinitionId: KPI_ID,
          kpiVersionId: "v1",
          version: 1,
          status: "active",
          nameEn: "Customer Retention Rate",
          nameAr: "معدل",
          similarity: 0.91,
          rank: 1,
          matchingFields: [],
        },
      ]);
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ suggestions: [validKpi] })),
        findSimilar,
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi"],
        maxSuggestions: 8,
      });

      // Reuse, not reimplementation: the registry's trigram search is what runs.
      expect(findSimilar).toHaveBeenCalledWith({
        text: "LTV to CAC Ratio",
        threshold: 0.45,
        limit: 3,
      });
      expect(batch.suggestions[0].duplicateMatches).toEqual([
        {
          kpiDefinitionId: KPI_ID,
          okrId: null,
          nameEn: "Customer Retention Rate",
          similarity: 0.91,
        },
      ]);
    });

    it("leaves a unique KPI unflagged", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(completion({ suggestions: [validKpi] })),
        findSimilar: vi.fn().mockResolvedValue([]),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["kpi"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions[0].duplicateMatches).toEqual([]);
    });

    it("flags an OKR that restates an existing one in the same theme", async () => {
      const { service } = makeService({
        complete: vi.fn().mockResolvedValue(
          completion({
            suggestions: [
              // Same words, different spacing and case.
              { ...validOkr, titleEn: "  drive revenue GROWTH 40% yoy " },
            ],
          }),
        ),
      });

      const batch = await service.generate({
        themeNodeId: THEME_ID,
        kinds: ["okr"],
        maxSuggestions: 8,
      });

      expect(batch.suggestions[0].duplicateMatches).toEqual([
        {
          kpiDefinitionId: null,
          okrId: "okr-1",
          nameEn: "Drive Revenue Growth 40% YoY",
          similarity: 1,
        },
      ]);
    });
  });

  describe("provider failures", () => {
    it("propagates unavailability without wrapping it", async () => {
      const { service } = makeService({
        complete: vi.fn().mockRejectedValue(new AiUnavailableError()),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiUnavailableError);
    });

    it("propagates a timeout distinctly from unavailability", async () => {
      const { service } = makeService({
        complete: vi.fn().mockRejectedValue(new AiTimeoutError()),
      });

      await expect(
        service.generate({ themeNodeId: THEME_ID, kinds: ["kpi"], maxSuggestions: 8 }),
      ).rejects.toBeInstanceOf(AiTimeoutError);
    });
  });
});
