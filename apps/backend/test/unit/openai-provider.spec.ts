import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAiLlmProvider } from "../../src/modules/ai/openai.provider";
import { AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";

/**
 * `fetch` is stubbed throughout — a unit test must never make a paid call.
 *
 * The `response_format: json_object` assertion pins down a real incident:
 * without it, a combined kpi+okr request could come back as prose or a
 * markdown-fenced block that the parser rejects as malformed output, rather
 * than valid JSON the schema can validate.
 */

const logger = createLogger("error");

function provider(maxRetries = 0) {
  return new OpenAiLlmProvider(
    {
      apiKey: "test-key",
      model: "gpt-4o-mini",
      baseUrl: "https://api.openai.com",
      timeoutMs: 50,
      maxRetries,
    },
    logger,
  );
}

const request = {
  system: "system",
  prompt: "prompt",
  maxOutputTokens: 8_192,
  temperature: 0.4,
  feature: "test",
};

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        model: "gpt-4o-mini-2024-07-18",
        choices: [{ message: { content: text } }],
      }),
  };
}

describe("OpenAI LLM provider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the model's text with provider and model identity attached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse('{"suggestions":[]}')));

    const result = await provider().complete(request);

    expect(result.text).toBe('{"suggestions":[]}');
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini-2024-07-18");
  });

  it("requests JSON-only output and forwards the caller's token budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(8_192);
  });

  it("sends the key as a header and never in the URL or body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(url).not.toContain("test-key");
    expect(init.body).not.toContain("test-key");
  });

  it("joins multi-choice text output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              { message: { content: '{"sugg' } },
              { message: { content: 'estions":[]}' } },
            ],
          }),
      }),
    );

    const result = await provider().complete(request);

    expect(result.text).toBe('{"suggestions":[]}');
  });

  it("retries a rate limit and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(okResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(2).complete(request)).resolves.toMatchObject({ text: "{}" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error such as a bad key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(3).complete(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted call as a timeout, distinctly from unavailability", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(provider().complete(request)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("never puts an upstream response body into the thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: "invalid api key sk-proj-live-42" } }),
      }),
    );

    const failure = await provider()
      .complete(request)
      .catch((error: unknown) => error as Error);

    expect(failure.message).not.toContain("sk-proj");
  });
});
