import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import { ApiKeyAuthService } from "../../src/modules/integrations/api-key-auth.service";

const apiKeyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const secret = "bsc_rd_sk_realsecretvalue";
const keyHash = createHash("sha256").update(secret).digest("hex");

function record(overrides: Partial<{ disabled: boolean; expiresAt: Date }> = {}) {
  return {
    id: apiKeyId,
    name: "Mobile App",
    scope: "READ" as const,
    keyPrefix: secret.slice(0, 12),
    keyHash,
    ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerName: "Data Steward",
    disabled: overrides.disabled ?? false,
    lastUsedLabel: "Never",
    requestCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 86_400_000),
  };
}

function harness(stored: ReturnType<typeof record> | null) {
  const findUnique = vi.fn(async () => stored);
  const update = vi.fn(async () => stored);
  const prisma = { apiKey: { findUnique, update } } as unknown as PrismaService;
  return { service: new ApiKeyAuthService(prisma), findUnique, update };
}

describe("ApiKeyAuthService", () => {
  it("rejects a key that doesn't use the platform's secret format without querying the database", async () => {
    const test = harness(null);
    await expect(test.service.verify("not-a-real-key")).resolves.toBeNull();
    expect(test.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unknown key", async () => {
    const test = harness(null);
    await expect(test.service.verify(secret)).resolves.toBeNull();
  });

  it("rejects a disabled key", async () => {
    const test = harness(record({ disabled: true }));
    await expect(test.service.verify(secret)).resolves.toBeNull();
    expect(test.update).not.toHaveBeenCalled();
  });

  it("rejects an expired key", async () => {
    const test = harness(record({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(test.service.verify(secret)).resolves.toBeNull();
    expect(test.update).not.toHaveBeenCalled();
  });

  it("accepts a valid key, returns its identity, and records usage", async () => {
    const test = harness(record());

    await expect(test.service.verify(secret)).resolves.toEqual({
      id: apiKeyId,
      name: "Mobile App",
      scope: "READ",
      ownerId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ownerName: "Data Steward",
    });

    expect(test.update).toHaveBeenCalledWith({
      where: { id: apiKeyId },
      data: { lastUsedLabel: "Just now", requestCount: { increment: 1 } },
    });
  });

  it("hashes the raw key before querying, never looking it up by plaintext", async () => {
    const test = harness(record());
    await test.service.verify(secret);
    expect(test.findUnique).toHaveBeenCalledWith({ where: { keyHash } });
  });
});
