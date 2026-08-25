import { createHash } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import type { ApiKeyScope } from "../../generated/prisma/client";

export interface VerifiedApiKey {
  id: string;
  name: string;
  scope: ApiKeyScope;
  ownerId: string;
  ownerName: string;
}

/**
 * Authenticates callers against keys minted on the Data & Integrations page.
 * A key that never authenticates anything is just a stored secret, so this
 * is what the public API router (see public-api.router.ts) checks incoming
 * requests against — and it's what keeps `lastUsedLabel`/`requestCount`
 * meaningful instead of permanently "Never" / 0.
 */
export class ApiKeyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(rawKey: string): Promise<VerifiedApiKey | null> {
    if (!rawKey.startsWith("bsc_")) return null;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const record = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!record || record.disabled || record.expiresAt.getTime() <= Date.now()) return null;

    await this.prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedLabel: "Just now", requestCount: { increment: 1 } },
    });

    return {
      id: record.id,
      name: record.name,
      scope: record.scope,
      ownerId: record.ownerId,
      ownerName: record.ownerName,
    };
  }
}
