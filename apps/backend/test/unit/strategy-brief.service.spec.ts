import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiBriefNotFoundError,
  AiMalformedOutputError,
  AiStrategyNotFoundError,
  AiTimeoutError,
  AiUnavailableError,
} from "../../src/modules/ai/ai.errors";
import { StrategyBriefService } from "../../src/modules/ai/strategy-brief.service";
import { createLogger } from "../../src/logging/logger";
import type { PrismaService } from "../../src/database/prisma.service";
import type { StrategyBriefCollector } from "../../src/modules/ai/strategy-brief.collector";
import type { StrategyBriefSnapshot } from "../../src/modules/ai/strategy-brief.types";

/**
 * This service's contract is a division of labour: facts come from the
 * snapshot, narrative comes from the model, and the two are never allowed to
 * swap places. Most of what follows is an attempt to make the model lie —
 * about an owner, a percentage, an objective count, a theme, or a risk — and
 * to assert that none of it reaches the brief.
 */

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const THEME_ID = "22222222-2222-4222-8222-222222222222";
const OBJECTIVE_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";

const baseSnapshot: StrategyBriefSnapshot = {
  rootNodeId: ROOT_ID,
  title: "Acme Corp 2025 Strategic Plan",
  vision: "Sustainable value creation through focused execution.",
  owner: "Alex Morgan",
  status: "on-track",
  progress: 74,
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  totalNodes: 8,
  themes: [
    { id: THEME_ID, name: "Revenue & Growth", objectiveCount: 2, status: "at-risk", progress: 58 },
  ],
  objectives: [
    {
      id: OBJECTIVE_ID,
      name: "Drive Revenue Growth 40% YoY",
      themeId: THEME_ID,
      themeName: "Revenue & Growth",
      owner: "Sarah Chen",
      progress: 67,
      status: "on-track",
      measureCount: 2,
      initiativeCount: 1,
    },
  ],
  initiativeCount: 2,
  projectCount: 1,
  measuredObjectiveCount: 1,
  riskSignals: [
    {
      kind: "at_risk_theme",
      area: "Revenue & Growth",
      nodeId: THEME_ID,
      nodeName: "Revenue & Growth",
      detail: 'Theme "Revenue & Growth" is at risk at 58% progress.',
    },
  ],
  insufficientData: false,
  insufficientDataReason: null,
};

const validNarrative = {
  executiveSummary:
    "Acme Corp 2025 Strategic Plan spans 1 strategic theme and 1 measurable objective at 74% overall progress.",
  visionSummary: null,
  expectedOutcomes: ["Achieve measurable improvement in revenue growth"],
  risks: [
    {
      severity: "medium",
      area: "Revenue & Growth",
      title: "Revenue theme is at risk",
      mitigation: "Immediate executive review and resource reallocation required.",
    },
  ],
  insufficientData: false,
  insufficientDataReason: null,
};

function completion(payload: unknown) {
  return {
    text: typeof payload === "string" ? payload : JSON.stringify(payload),
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 480,
  };
}

interface Harness {
  service: StrategyBriefService;
  complete: ReturnType<typeof vi.fn>;
  collect: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeService(
  complete = vi.fn().mockResolvedValue(completion(validNarrative)),
  snapshot: StrategyBriefSnapshot = baseSnapshot,
): Harness {
  const collect = vi.fn().mockResolvedValue(snapshot);
  const findUnique = vi.fn().mockResolvedValue(null);
  const upsert = vi.fn().mockResolvedValue({});
  const update = vi.fn();
  const prisma = { strategyBrief: { findUnique, upsert, update } };
  const llm = { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete };

  const service = new StrategyBriefService(
    prisma as unknown as PrismaService,
    { collect } as unknown as StrategyBriefCollector,
    llm as never,
    createLogger("error"),
  );

  return { service, complete, collect, findUnique, upsert, update };
}

describe("StrategyBriefService", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("grounding the prompt", () => {
    it("sends the real themes, objectives, owners, and risk signals to the model", async () => {
      const { service, complete } = makeService();

      await service.generate({ actorUserId: ACTOR_ID });

      const request = complete.mock.calls[0][0];
      expect(request.prompt).toContain("Acme Corp 2025 Strategic Plan");
      expect(request.prompt).toContain("Revenue & Growth");
      expect(request.prompt).toContain("Drive Revenue Growth 40% YoY");
      expect(request.prompt).toContain("Sarah Chen");
      expect(request.prompt).toContain("at_risk_theme");
      expect(request.feature).toBe("strategy_brief.generate");
    });

    it("instructs the model never to invent facts", async () => {
      const { service, complete } = makeService();

      await service.generate({ actorUserId: ACTOR_ID });

      const request = complete.mock.calls[0][0];
      expect(request.system).toContain("Never invent objectives");
      expect(request.system).toContain("may only be drawn from the supplied RISK SIGNALS");
    });

    it("tells the model plainly when there are no risk signals to write about", async () => {
      const { service, complete } = makeService(
        vi.fn().mockResolvedValue(completion({ ...validNarrative, risks: [] })),
        { ...baseSnapshot, riskSignals: [] },
      );

      await service.generate({ actorUserId: ACTOR_ID });

      expect(complete.mock.calls[0][0].prompt).toContain("no risk signals were detected");
    });
  });

  describe("facts are never taken from the model", () => {
    it("uses snapshot themes and objectives even when the model returns others", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({
            ...validNarrative,
            strategicThemes: [{ id: "fake", name: "Invented Theme", objectiveCount: 99 }],
            strategicObjectives: [{ id: "fake", name: "Invented Objective", owner: "Nobody" }],
          }),
        ),
      );

      // The extra keys make the response fail `.strict()` — a model that tries
      // to supply facts is rejected outright rather than partly believed.
      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
    });

    it("publishes theme counts, owners, and progress straight from the snapshot", async () => {
      const { service } = makeService();

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicThemes).toEqual([
        { id: THEME_ID, name: "Revenue & Growth", objectiveCount: 2 },
      ]);
      expect(brief.strategicObjectives).toEqual([
        {
          id: OBJECTIVE_ID,
          name: "Drive Revenue Growth 40% YoY",
          themeId: THEME_ID,
          themeName: "Revenue & Growth",
          owner: "Sarah Chen",
          progress: 67,
          health: "on-track",
        },
      ]);
    });

    it("carries a null progress through as null rather than as a number", async () => {
      const { service } = makeService(undefined, {
        ...baseSnapshot,
        objectives: [{ ...baseSnapshot.objectives[0]!, progress: null, measureCount: 0 }],
      });

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicObjectives[0]!.progress).toBeNull();
    });
  });

  describe("strategic vision", () => {
    it("uses the strategy's own vision and marks it as such", async () => {
      const { service } = makeService();

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicVision).toEqual({
        content: "Sustainable value creation through focused execution.",
        source: "strategy",
        aiContent: null,
      });
    });

    it("never lets the model overwrite an authored vision", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({ ...validNarrative, visionSummary: "A completely different vision." }),
        ),
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicVision.content).toBe(
        "Sustainable value creation through focused execution.",
      );
    });

    it("falls back to the model's draft only when no vision exists", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({ ...validNarrative, visionSummary: "Drafted direction from the objectives." }),
        ),
        { ...baseSnapshot, vision: null },
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicVision).toEqual({
        content: "Drafted direction from the objectives.",
        source: "ai",
        aiContent: "Drafted direction from the objectives.",
      });
    });

    it("leaves the vision empty when there is none and the model declines to draft one", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(completion({ ...validNarrative, visionSummary: null })),
        { ...baseSnapshot, vision: null },
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.strategicVision).toEqual({ content: null, source: "none", aiContent: null });
    });
  });

  describe("risk grounding", () => {
    it("keeps a risk whose area names a real theme", async () => {
      const { service } = makeService();

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.risks).toEqual([
        {
          severity: "medium",
          area: "Revenue & Growth",
          title: "Revenue theme is at risk",
          mitigation: "Immediate executive review and resource reallocation required.",
        },
      ]);
    });

    it("clears an area that does not name a real theme", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({
            ...validNarrative,
            risks: [{ ...validNarrative.risks[0], area: "Supply Chain Resilience" }],
          }),
        ),
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.risks[0]!.area).toBeNull();
    });

    it("discards every risk when the snapshot detected no signals", async () => {
      const { service } = makeService(vi.fn().mockResolvedValue(completion(validNarrative)), {
        ...baseSnapshot,
        riskSignals: [],
      });

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.risks).toEqual([]);
    });
  });

  describe("insufficient data", () => {
    it("never calls the model for a strategy with nothing to summarise", async () => {
      const { service, complete } = makeService(vi.fn(), {
        ...baseSnapshot,
        themes: [],
        objectives: [],
        riskSignals: [],
        insufficientData: true,
        insufficientDataReason: "This strategy has no themes or objectives yet.",
      });

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(complete).not.toHaveBeenCalled();
      expect(brief.insufficientData).toBe(true);
      expect(brief.insufficientDataReason).toBe("This strategy has no themes or objectives yet.");
      expect(brief.risks).toEqual([]);
      expect(brief.expectedOutcomes).toEqual([]);
      expect(brief.executiveSummary.content).toContain("insufficient strategy data");
    });

    it("passes the model's own insufficient-data verdict through", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({
            ...validNarrative,
            insufficientData: true,
            insufficientDataReason: "No objective carries measurable progress.",
          }),
        ),
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.insufficientData).toBe(true);
      expect(brief.insufficientDataReason).toBe("No objective carries measurable progress.");
    });
  });

  describe("malformed output", () => {
    it("rejects a response that is not valid JSON", async () => {
      const { service } = makeService(vi.fn().mockResolvedValue(completion("not json at all")));

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
    });

    it("rejects a response missing required fields", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(completion({ executiveSummary: "Only this" })),
      );

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
    });

    it("rejects an empty completion", async () => {
      const { service } = makeService(vi.fn().mockResolvedValue(completion("")));

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
    });

    it("rejects an unknown risk severity", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({
            ...validNarrative,
            risks: [{ ...validNarrative.risks[0], severity: "critical" }],
          }),
        ),
      );

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
    });

    it("extracts JSON embedded in prose or a code fence", async () => {
      const { service } = makeService(
        vi
          .fn()
          .mockResolvedValue(
            completion(`Here you go:\n\`\`\`json\n${JSON.stringify(validNarrative)}\n\`\`\``),
          ),
      );

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.executiveSummary.content).toBe(validNarrative.executiveSummary);
    });

    it("nothing is persisted when the model's answer is rejected", async () => {
      const { service, upsert } = makeService(vi.fn().mockResolvedValue(completion("garbage")));

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiMalformedOutputError,
      );
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  describe("provider failure", () => {
    it("propagates an unavailable provider without wrapping it", async () => {
      const { service } = makeService(vi.fn().mockRejectedValue(new AiUnavailableError()));

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiUnavailableError,
      );
    });

    it("propagates a timeout without wrapping it", async () => {
      const { service } = makeService(vi.fn().mockRejectedValue(new AiTimeoutError()));

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiTimeoutError,
      );
    });

    it("propagates a missing strategy from the collector", async () => {
      const { service, collect } = makeService();
      collect.mockRejectedValue(new AiStrategyNotFoundError());

      await expect(service.generate({ actorUserId: ACTOR_ID })).rejects.toBeInstanceOf(
        AiStrategyNotFoundError,
      );
    });
  });

  describe("persistence", () => {
    it("stores one brief per strategy root, keyed for replacement", async () => {
      const { service, upsert } = makeService();

      await service.generate({ actorUserId: ACTOR_ID });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rootNodeId: ROOT_ID },
          create: expect.objectContaining({ rootNodeId: ROOT_ID, generatedBy: ACTOR_ID }),
          update: expect.objectContaining({ generatedBy: ACTOR_ID }),
        }),
      );
    });

    it("returns null when no brief has been generated yet", async () => {
      const { service } = makeService();

      await expect(service.get()).resolves.toBeNull();
    });

    it("reads a stored brief back through the schema", async () => {
      const { service, findUnique } = makeService();
      const generated = await service.generate({ actorUserId: ACTOR_ID });
      findUnique.mockResolvedValue({
        rootNodeId: ROOT_ID,
        payload: JSON.parse(JSON.stringify(generated)),
        executiveSummaryOverride: null,
        strategicVisionOverride: null,
        generatedAt: new Date(generated.generatedAt),
      });

      await expect(service.get()).resolves.toEqual(generated);
    });

    it("reports a stored payload that no longer matches the schema as absent", async () => {
      const { service, findUnique } = makeService();
      findUnique.mockResolvedValue({
        rootNodeId: ROOT_ID,
        payload: { shape: "from an older deploy" },
        executiveSummaryOverride: null,
        strategicVisionOverride: null,
        generatedAt: new Date(),
      });

      await expect(service.get()).resolves.toBeNull();
    });
  });

  describe("editing a section", () => {
    it("refuses to edit a brief that was never generated", async () => {
      const { service } = makeService();

      await expect(
        service.updateSection({
          edit: { section: "executiveSummary", content: "Rewritten." },
        }),
      ).rejects.toBeInstanceOf(AiBriefNotFoundError);
    });

    it("stores the edit against the right column and marks the section as user-authored", async () => {
      const { service, findUnique, update } = makeService();
      const generated = await service.generate({ actorUserId: ACTOR_ID });
      const payload = JSON.parse(JSON.stringify(generated));
      findUnique.mockResolvedValue({ rootNodeId: ROOT_ID, payload });
      update.mockResolvedValue({
        rootNodeId: ROOT_ID,
        payload,
        executiveSummaryOverride: "An executive rewrote this.",
        strategicVisionOverride: null,
        generatedAt: new Date(generated.generatedAt),
      });

      const brief = await service.updateSection({
        edit: { section: "executiveSummary", content: "An executive rewrote this." },
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rootNodeId: ROOT_ID },
          data: { executiveSummaryOverride: "An executive rewrote this." },
        }),
      );
      expect(brief.executiveSummary).toEqual({
        content: "An executive rewrote this.",
        source: "user",
        aiContent: validNarrative.executiveSummary,
      });
      // The untouched section is unaffected.
      expect(brief.strategicVision.source).toBe("strategy");
    });

    it("reverts to the model's text when the edit is cleared", async () => {
      const { service, findUnique, update } = makeService();
      const generated = await service.generate({ actorUserId: ACTOR_ID });
      const payload = JSON.parse(JSON.stringify(generated));
      findUnique.mockResolvedValue({ rootNodeId: ROOT_ID, payload });
      update.mockResolvedValue({
        rootNodeId: ROOT_ID,
        payload,
        executiveSummaryOverride: null,
        strategicVisionOverride: null,
        generatedAt: new Date(generated.generatedAt),
      });

      const brief = await service.updateSection({
        edit: { section: "executiveSummary", content: null },
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { executiveSummaryOverride: null } }),
      );
      expect(brief.executiveSummary.source).toBe("ai");
      expect(brief.executiveSummary.content).toBe(validNarrative.executiveSummary);
    });

    it("rejects an edit that is empty after trimming", async () => {
      const { service } = makeService();

      await expect(
        service.updateSection({ edit: { section: "executiveSummary", content: "   " } }),
      ).rejects.toThrow();
    });
  });

  describe("regeneration", () => {
    it("re-collects the hierarchy rather than reusing an old snapshot", async () => {
      const { service, collect } = makeService();

      await service.generate({ actorUserId: ACTOR_ID });
      await service.generate({ actorUserId: ACTOR_ID });

      expect(collect).toHaveBeenCalledTimes(2);
    });

    it("refreshes the AI text without discarding an edit a human made", async () => {
      const { service, findUnique } = makeService();
      findUnique.mockResolvedValue({
        executiveSummaryOverride: "An executive rewrote this.",
        strategicVisionOverride: null,
      });

      const brief = await service.generate({ actorUserId: ACTOR_ID });

      expect(brief.executiveSummary.content).toBe("An executive rewrote this.");
      expect(brief.executiveSummary.source).toBe("user");
      // The freshly generated text is still available to revert to.
      expect(brief.executiveSummary.aiContent).toBe(validNarrative.executiveSummary);
    });
  });
});
