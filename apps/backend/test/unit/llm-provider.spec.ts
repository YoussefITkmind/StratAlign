import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AnthropicLlmProvider,
  UnconfiguredLlmProvider,
} from "../../src/modules/ai/anthropic.provider";
import { OpenAILlmProvider } from "../../src/modules/ai/openai.provider";
import { AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLlmProvider } from "../../src/modules/ai/llm.factory";
import { createLogger } from "../../src/logging/logger";

/**
 * The provider is the only code that talks to a vendor. These tests pin the
 * contract the rest of the platform relies on: no vendor error shape escapes,
 * a transient failure is retried, and a missing key degrades the feature rather
 * than taking the process down.
 *
 * `fetch` is stubbed throughout — a unit test must never make a paid call.
 */

const logger = createLogger("error");

function provider(maxRetries = 0) {
  return new AnthropicLlmProvider(
    {
      apiKey: "test-key",
      model: "claude-sonnet-5",
      baseUrl: "https://api.anthropic.com",
      timeoutMs: 50,
      maxRetries,
    },
    logger,
  );
}

const request = {
  system: "system",
  prompt: "prompt",
  maxOutputTokens: 1024,
  temperature: 0.4,
  feature: "test",
};

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        model: "claude-sonnet-5",
        content: [{ type: "text", text }],
      }),
  };
}

describe("Anthropic LLM provider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the model's text with provider and model identity attached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse('{"suggestions":[]}')));

    const result = await provider().complete(request);

    expect(result.text).toBe('{"suggestions":[]}');
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-sonnet-5");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the key as a header and never in the URL or body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await provider().complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(url).not.toContain("test-key");
    expect(init.body).not.toContain("test-key");
  });

  it("joins multi-block text output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            content: [
              { type: "text", text: '{"sugg' },
              { type: "thinking", text: "ignored" },
              { type: "text", text: 'estions":[]}' },
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

  it("retries a server error up to the configured limit, then gives up", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(1).complete(request)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    // One initial attempt plus one retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error such as a bad key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(3).complete(request)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted call as a timeout, distinctly from unavailability", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(provider().complete(request)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("normalises a network failure rather than leaking the driver error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.anthropic.com")),
    );

    const failure = await provider()
      .complete(request)
      .catch((error: unknown) => error as Error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect(failure.message).not.toContain("ENOTFOUND");
  });

  it("never puts an upstream response body into the thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({ error: { message: "invalid api key sk-ant-live-42" } }),
      }),
    );

    const failure = await provider()
      .complete(request)
      .catch((error: unknown) => error as Error);

    expect(failure.message).not.toContain("sk-ant");
  });
});

describe("OpenAI LLM provider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  function openAiProvider(maxRetries = 0) {
    return new OpenAILlmProvider(
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

  function openAiOkResponse(content: string) {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          model: "gpt-4o-mini",
          choices: [{ message: { role: "assistant", content } }],
        }),
    };
  }

  it("returns the model's text with provider and model identity attached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(openAiOkResponse('{"suggestions":[]}')),
    );

    const result = await openAiProvider().complete(request);

    expect(result.text).toBe('{"suggestions":[]}');
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("posts to the chat completions endpoint with the configured model and JSON mode", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openAiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await openAiProvider().complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages).toEqual([
      { role: "system", content: request.system },
      { role: "user", content: request.prompt },
    ]);
  });

  it("sends the key as a bearer header and never in the URL or body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openAiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await openAiProvider().complete(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(url).not.toContain("test-key");
    expect(init.body).not.toContain("test-key");
  });

  it("extracts the first choice's message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        openAiOkResponse('  {"suggestions":[]}  '),
      ),
    );

    const result = await openAiProvider().complete(request);

    expect(result.text).toBe('{"suggestions":[]}');
  });

  it("retries a rate limit and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(openAiOkResponse("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(openAiProvider(2).complete(request)).resolves.toMatchObject({
      text: "{}",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a server error up to the configured limit, then gives up", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(openAiProvider(1).complete(request)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error such as a bad key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(openAiProvider(3).complete(request)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted call as a timeout, distinctly from unavailability", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(openAiProvider().complete(request)).rejects.toBeInstanceOf(
      AiTimeoutError,
    );
  });

  it("normalises a network failure rather than leaking the driver error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.openai.com")),
    );

    const failure = await openAiProvider()
      .complete(request)
      .catch((error: unknown) => error as Error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect(failure.message).not.toContain("ENOTFOUND");
  });

  it("never puts an upstream response body into the thrown error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({ error: { message: "invalid api key sk-proj-live-42" } }),
      }),
    );

    const failure = await openAiProvider()
      .complete(request)
      .catch((error: unknown) => error as Error);

    expect(failure.message).not.toContain("sk-proj");
  });
});

describe("LLM provider factory", () => {
  it("returns a refusing placeholder when the provider is disabled", () => {
    const created = createLlmProvider(
      {
        provider: "disabled",
        model: "claude-sonnet-5",
        baseUrl: "https://api.anthropic.com",
        timeoutMs: 1000,
        maxRetries: 0,
      },
      logger,
    );

    expect(created).toBeInstanceOf(UnconfiguredLlmProvider);
    expect(created.isConfigured).toBe(false);
  });

  it("degrades to the placeholder when a provider is chosen without a key", () => {
    // Booting must not fail: every non-AI route has to keep working in an
    // environment with no AI credentials.
    const created = createLlmProvider(
      {
        provider: "anthropic",
        model: "claude-sonnet-5",
        baseUrl: "https://api.anthropic.com",
        timeoutMs: 1000,
        maxRetries: 0,
      },
      logger,
    );

    expect(created.isConfigured).toBe(false);
  });

  it("degrades to the placeholder when openai is chosen without a key", () => {
    const created = createLlmProvider(
      {
        provider: "openai",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com",
        timeoutMs: 1000,
        maxRetries: 0,
      },
      logger,
    );

    expect(created).toBeInstanceOf(UnconfiguredLlmProvider);
    expect(created.isConfigured).toBe(false);
  });

  it("builds a real Anthropic provider when fully configured", () => {
    const created = createLlmProvider(
      {
        provider: "anthropic",
        apiKey: "test-key",
        model: "claude-sonnet-5",
        baseUrl: "https://api.anthropic.com",
        timeoutMs: 1000,
        maxRetries: 2,
      },
      logger,
    );

    expect(created).toBeInstanceOf(AnthropicLlmProvider);
    expect(created.isConfigured).toBe(true);
    expect(created.model).toBe("claude-sonnet-5");
  });

  it("builds a real OpenAI provider when fully configured", () => {
    const created = createLlmProvider(
      {
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4o-mini",
        baseUrl: "https://api.openai.com",
        timeoutMs: 1000,
        maxRetries: 2,
      },
      logger,
    );

    expect(created).toBeInstanceOf(OpenAILlmProvider);
    expect(created.isConfigured).toBe(true);
    expect(created.model).toBe("gpt-4o-mini");
  });

  it("refuses loudly rather than returning canned suggestions", async () => {
    await expect(new UnconfiguredLlmProvider().complete()).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});
