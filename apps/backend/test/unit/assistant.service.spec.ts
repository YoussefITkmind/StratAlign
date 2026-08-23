import { describe, expect, it, vi } from "vitest";

import { ContextAwareAssistantService } from "../../src/modules/ai/assistant.service";
import { AiMalformedOutputError, AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";
import type { AskAssistantInput } from "../../src/modules/ai/assistant.types";

/**
 * Grounding is this service's entire job: the model only ever sees what
 * `input.context` carries, and its answer is only ever trusted once it
 * matches the fixed structured-output schema. These tests hold both ends of
 * that boundary — what reaches the prompt, and what is allowed back out.
 */

function completion(payload: unknown, overrides: Partial<{ provider: string; model: string; latencyMs: number }> = {}) {
  return {
    text: typeof payload === "string" ? payload : JSON.stringify(payload),
    provider: overrides.provider ?? "anthropic",
    model: overrides.model ?? "claude-sonnet-5",
    latencyMs: overrides.latencyMs ?? 512,
  };
}

const validAnswer = {
  answer: "Revenue Growth is currently 12%, based on the supplied scorecard data.",
  confidence: 0.9,
  grounded: true,
  insufficientContext: false,
  referencedEntities: ["Revenue Growth"],
};

function makeService(complete = vi.fn().mockResolvedValue(completion(validAnswer))) {
  const llm = { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete };
  const service = new ContextAwareAssistantService(llm as never, createLogger("error"));
  return { service, complete };
}

const baseInput: AskAssistantInput = {
  message: "What is the current revenue growth?",
  context: {
    module: "balanced_scorecards",
    moduleName: "Balanced Scorecards",
    route: "/balanced-scorecards/11111111-1111-4111-8111-111111111111",
    entity: {
      type: "scorecard",
      id: "11111111-1111-4111-8111-111111111111",
      name: "Corporate Scorecard 2025",
    },
    data: {
      kpis: [{ name: "Revenue Growth", status: "on_track" }],
    },
    capabilities: ["analyze_kpis"],
  },
  history: [],
};

describe("ContextAwareAssistantService", () => {
  describe("language", () => {
    it("instructs the model to answer in English only", async () => {
      const { service, complete } = makeService();

      await service.ask(baseInput);

      const request = complete.mock.calls[0][0];
      expect(request.system).toContain("Write `answer` in English only");
      expect(request.system).toContain("Do not answer in Arabic");
    });
  });

  describe("grounding", () => {
    it("passes the supplied context, capabilities, and question to the model", async () => {
      const { service, complete } = makeService();

      await service.ask(baseInput);

      const request = complete.mock.calls[0][0];
      expect(request.prompt).toContain("Corporate Scorecard 2025");
      expect(request.prompt).toContain("Revenue Growth");
      expect(request.prompt).toContain("analyze_kpis");
      expect(request.prompt).toContain("What is the current revenue growth?");
      expect(request.system).toContain("Never invent business metrics");
      expect(request.feature).toBe("assistant.global");
    });

    it("includes prior conversation turns in the prompt", async () => {
      const { service, complete } = makeService();

      await service.ask({
        ...baseInput,
        history: [
          { role: "user", content: "Which KPIs are underperforming?" },
          { role: "assistant", content: "Based on the current scorecard, none are off track." },
        ],
      });

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("Which KPIs are underperforming?");
      expect(prompt).toContain("none are off track");
    });

    it("returns the model's structured answer unchanged", async () => {
      const { service } = makeService();

      const answer = await service.ask(baseInput);

      expect(answer).toEqual(validAnswer);
    });
  });

  describe("insufficient context", () => {
    it("passes through an honest insufficient-context answer rather than rejecting it", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(
          completion({
            answer: "I don't have enough data in the current context to determine why revenue decreased.",
            confidence: 0.2,
            grounded: false,
            insufficientContext: true,
            referencedEntities: [],
          }),
        ),
      );

      const answer = await service.ask({
        ...baseInput,
        message: "Why did revenue decrease?",
      });

      expect(answer.insufficientContext).toBe(true);
      expect(answer.grounded).toBe(false);
    });
  });

  describe("malformed output", () => {
    it("rejects a response that is not valid JSON", async () => {
      const { service } = makeService(vi.fn().mockResolvedValue(completion("not json at all")));

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects a response missing required fields", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(completion({ answer: "Some text" })),
      );

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects an empty completion", async () => {
      const { service } = makeService(vi.fn().mockResolvedValue(completion("")));

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("rejects confidence outside the 0-1 range", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(completion({ ...validAnswer, confidence: 1.5 })),
      );

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiMalformedOutputError);
    });

    it("extracts JSON embedded in prose or a code fence", async () => {
      const { service } = makeService(
        vi.fn().mockResolvedValue(completion(`Here you go:\n\`\`\`json\n${JSON.stringify(validAnswer)}\n\`\`\``)),
      );

      await expect(service.ask(baseInput)).resolves.toEqual(validAnswer);
    });
  });

  describe("provider failure", () => {
    it("propagates an unavailable-provider failure without wrapping it", async () => {
      const { service } = makeService(vi.fn().mockRejectedValue(new AiUnavailableError()));

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiUnavailableError);
    });

    it("propagates a timeout without wrapping it", async () => {
      const { service } = makeService(vi.fn().mockRejectedValue(new AiTimeoutError()));

      await expect(service.ask(baseInput)).rejects.toBeInstanceOf(AiTimeoutError);
    });
  });

  describe("input validation", () => {
    it("refuses a message that is empty after trimming", async () => {
      const { service } = makeService();

      await expect(service.ask({ ...baseInput, message: "   " })).rejects.toThrow();
    });
  });
});
