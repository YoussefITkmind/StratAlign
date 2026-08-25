import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenAiTtsProvider } from "../../src/modules/ai/openai-tts.provider";
import { createTtsProvider } from "../../src/modules/ai/tts.factory";
import { UnconfiguredTtsProvider } from "../../src/modules/ai/tts.provider";
import { AiTimeoutError, AiUnavailableError } from "../../src/modules/ai/ai.errors";
import { createLogger } from "../../src/logging/logger";

/**
 * `fetch` is stubbed throughout — a unit test must never make a paid call.
 *
 * The normalisation assertions are the point of this file: an upstream body
 * can echo the submitted text and can carry account identifiers, so every
 * failure has to leave this class as one of the module's own error types and
 * nothing else.
 */

const logger = createLogger("error");

function provider(maxRetries = 0) {
  return new OpenAiTtsProvider(
    {
      apiKey: "test-key",
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      baseUrl: "https://api.openai.com",
      timeoutMs: 50,
      maxRetries,
    },
    logger,
  );
}

const request = { text: "Revenue Growth is off track.", feature: "ai.audio-brief" };

function okResponse(bytes: Buffer) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: () =>
      Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

describe("OpenAI text-to-speech provider", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("returns mp3 audio with provider, model, and voice identity attached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(Buffer.from("mp3"))));

    const result = await provider().synthesize(request);

    expect(result.audio.toString()).toBe("mp3");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.format).toBe("mp3");
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o-mini-tts");
    expect(result.voice).toBe("alloy");
  });

  it("posts the configured model and voice to the speech endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(Buffer.from("mp3")));
    vi.stubGlobal("fetch", fetchMock);

    await provider().synthesize(request);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: request.text,
      response_format: "mp3",
    });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
  });

  it("normalises a non-retryable upstream failure to an unavailable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    );

    const failure = await provider().synthesize(request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect(String((failure as Error).message)).not.toContain("400");
  });

  it("normalises an aborted request to a timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })),
    );

    await expect(provider().synthesize(request)).rejects.toBeInstanceOf(AiTimeoutError);
  });

  it("normalises an unrecognised transport failure to an unavailable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND")));

    const failure = await provider().synthesize(request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect(String((failure as Error).message)).not.toContain("ENOTFOUND");
  });

  it("retries a retryable status and succeeds on the next attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
      .mockResolvedValueOnce(okResponse(Buffer.from("mp3")));
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider(1).synthesize(request);

    expect(result.audio.toString()).toBe("mp3");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider(2).synthesize(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an empty audio body as a provider failure rather than silent audio", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(Buffer.alloc(0))));

    await expect(provider().synthesize(request)).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("createTtsProvider", () => {
  it("returns a refusing placeholder when no API key is configured", async () => {
    const created = createTtsProvider(
      { provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy", timeoutMs: 1_000, maxRetries: 0 },
      logger,
    );

    expect(created).toBeInstanceOf(UnconfiguredTtsProvider);
    expect(created.isConfigured).toBe(false);
    await expect(created.synthesize(request)).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("returns a refusing placeholder when text-to-speech is disabled", () => {
    const created = createTtsProvider(
      { provider: "disabled", apiKey: "key", model: "m", voice: "v", timeoutMs: 1_000, maxRetries: 0 },
      logger,
    );

    expect(created).toBeInstanceOf(UnconfiguredTtsProvider);
  });

  it("builds an OpenAI provider when a key is present", () => {
    const created = createTtsProvider(
      { provider: "openai", apiKey: "key", model: "gpt-4o-mini-tts", voice: "verse", timeoutMs: 1_000, maxRetries: 0 },
      logger,
    );

    expect(created).toBeInstanceOf(OpenAiTtsProvider);
    expect(created.isConfigured).toBe(true);
    expect(created.voice).toBe("verse");
  });
});
