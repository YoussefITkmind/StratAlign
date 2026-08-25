import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ApiKeyAuthService, VerifiedApiKey } from "../../src/modules/integrations/api-key-auth.service";
import { handlePublicApiRequest } from "../../src/modules/integrations/public-api.router";

function fakeResponse() {
  let statusCode = 200;
  let body = "";
  const headers: Record<string, string> = {};
  const response = {
    setHeader: vi.fn((key: string, value: string) => {
      headers[key] = value;
    }),
    end: vi.fn((chunk?: string) => {
      body = chunk ?? "";
    }),
    get statusCode() {
      return statusCode;
    },
    set statusCode(value: number) {
      statusCode = value;
    },
  } as unknown as ServerResponse;
  return { response, headers, body: () => body, status: () => statusCode };
}

function request(url: string, method: string, authorization?: string): IncomingMessage {
  return { url, method, headers: authorization ? { authorization } : {} } as IncomingMessage;
}

const verifiedKey: VerifiedApiKey = {
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "Mobile App",
  scope: "READ",
  ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  ownerName: "Data Steward",
};

describe("handlePublicApiRequest", () => {
  it("rejects a request with no Authorization header", async () => {
    const verify = vi.fn();
    const { response, status, body } = fakeResponse();

    await handlePublicApiRequest(request("/api/v1/whoami", "GET"), response, { verify } as unknown as ApiKeyAuthService);

    expect(status()).toBe(401);
    expect(JSON.parse(body())).toMatchObject({ error: expect.any(String) });
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header", async () => {
    const verify = vi.fn();
    const { response, status } = fakeResponse();

    await handlePublicApiRequest(
      request("/api/v1/whoami", "GET", "Basic xyz"),
      response,
      { verify } as unknown as ApiKeyAuthService,
    );

    expect(status()).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired key", async () => {
    const verify = vi.fn().mockResolvedValue(null);
    const { response, status } = fakeResponse();

    await handlePublicApiRequest(
      request("/api/v1/whoami", "GET", "Bearer bsc_rd_sk_bad"),
      response,
      { verify } as unknown as ApiKeyAuthService,
    );

    expect(status()).toBe(401);
    expect(verify).toHaveBeenCalledWith("bsc_rd_sk_bad");
  });

  it("returns the key's identity for a valid key on /api/v1/whoami", async () => {
    const verify = vi.fn().mockResolvedValue(verifiedKey);
    const { response, status, body } = fakeResponse();

    await handlePublicApiRequest(
      request("/api/v1/whoami", "GET", "Bearer bsc_rd_sk_good"),
      response,
      { verify } as unknown as ApiKeyAuthService,
    );

    expect(status()).toBe(200);
    expect(JSON.parse(body())).toEqual({
      keyId: verifiedKey.id,
      keyName: verifiedKey.name,
      scope: verifiedKey.scope,
      owner: verifiedKey.ownerName,
    });
  });

  it("returns 404 for an authenticated request to an unknown route", async () => {
    const verify = vi.fn().mockResolvedValue(verifiedKey);
    const { response, status } = fakeResponse();

    await handlePublicApiRequest(
      request("/api/v1/does-not-exist", "GET", "Bearer bsc_rd_sk_good"),
      response,
      { verify } as unknown as ApiKeyAuthService,
    );

    expect(status()).toBe(404);
  });

  it("never throws even if the auth service rejects", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("db down"));
    const { response, status } = fakeResponse();

    await expect(
      handlePublicApiRequest(
        request("/api/v1/whoami", "GET", "Bearer bsc_rd_sk_good"),
        response,
        { verify } as unknown as ApiKeyAuthService,
      ),
    ).resolves.toBeUndefined();
    expect(status()).toBe(500);
  });
});
