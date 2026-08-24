import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAiTtsProvider, UnconfiguredTtsProvider } from "../../src/modules/ai/openai-tts.provider";
import { AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";

/** `fetch` is stubbed throughout — a unit test must never make a paid call. */

const logger = createLogger("error");

function provider(maxRetries = 0) {
  return new OpenAiTtsProvider(
    { apiKey: "test-key", baseUrl: "https://api.openai.com", timeoutMs: 50, maxRetries },
    logger,
  );
}

const request = { text: "Here is your executive briefing.", voice: "onyx", model: "tts-1", feature: "test" };

function okResponse(bytes: Uint8Array) {
  return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(bytes.buffer) };
}

describe("OpenAI TTS provider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns the synthesised audio with provider and model identity attached", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(bytes)));

    const result = await provider().synthesize(request);

    expect(result.audio).toEqual(Buffer.from(bytes));
    expect(result.mimeType).toBe("audio/mpeg");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("tts-1");
  });

  it("posts the English script, model, and voice to the speech endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchMock);

    await provider().synthesize(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      model: "tts-1",
      voice: "onyx",
      input: "Here is your executive briefing.",
      response_format: "mp3",
    });
  });

  it("sends the key as a header and never in the URL or body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchMock);

    await provider().synthesize(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe("Bearer test-key");
    expect(url).not.toContain("test-key");
    expect(init.body).not.toContain("test-key");
  });

  it("retries a rate limit and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce(okResponse(new Uint8Array([9])));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(2).synthesize(request)).resolves.toMatchObject({ mimeType: "audio/mpeg" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error such as a bad key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(3).synthesize(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an aborted call as a timeout, distinctly from unavailability", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(provider().synthesize(request)).rejects.toBeInstanceOf(AiTimeoutError);
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

    const failure = await provider().synthesize(request).catch((error: unknown) => error as Error);

    expect(failure.message).not.toContain("sk-proj");
  });
});

describe("UnconfiguredTtsProvider", () => {
  it("refuses loudly rather than returning fake audio", async () => {
    await expect(new UnconfiguredTtsProvider().synthesize(request)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    expect(new UnconfiguredTtsProvider().isConfigured).toBe(false);
  });
});
