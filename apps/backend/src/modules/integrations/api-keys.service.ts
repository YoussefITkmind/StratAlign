import { createHash, randomBytes } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import type { ApiKey as ApiKeyRow, ApiKeyScope } from "../../generated/prisma/client";
import { integrationsErrors } from "./integrations.errors";

export interface ApiKeyView {
  id: string;
  name: string;
  scope: ApiKeyScope;
  keyPreview: string;
  owner: string;
  created: string;
  expires: string;
  lastUsed: string;
  requests: number;
  disabled: boolean;
}

export interface CreatedApiKey extends ApiKeyView {
  secret: string;
}

export interface CreateApiKeyInput {
  name: string;
  scope: ApiKeyScope;
  ownerId: string;
  ownerName: string;
}

const SCOPE_PREFIX: Record<ApiKeyScope, string> = {
  ADMIN: "adm",
  READ: "rd",
  WRITE: "wrt",
};

const dateLabel = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function maskPreview(keyPrefix: string): string {
  return `${keyPrefix}${"•".repeat(16)}`;
}

function toView(row: ApiKeyRow): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    keyPreview: maskPreview(row.keyPrefix),
    owner: row.ownerName,
    created: dateLabel(row.createdAt),
    expires: dateLabel(row.expiresAt),
    lastUsed: row.lastUsedLabel,
    requests: row.requestCount,
    disabled: row.disabled,
  };
}

export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ApiKeyView[]> {
    const rows = await this.prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(toView);
  }

  async create(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    const secret = `bsc_${SCOPE_PREFIX[input.scope]}_sk_${randomBytes(16).toString("hex")}`;
    const keyHash = createHash("sha256").update(secret).digest("hex");
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const row = await this.prisma.apiKey.create({
      data: {
        name: input.name,
        scope: input.scope,
        keyPrefix: secret.slice(0, 12),
        keyHash,
        ownerId: input.ownerId,
        ownerName: input.ownerName,
        expiresAt,
      },
    });

    return { ...toView(row), secret };
  }

  async toggleDisabled(id: string): Promise<ApiKeyView> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.apiKeyNotFound();

    const { count } = await this.prisma.apiKey.updateMany({
      where: { id, disabled: existing.disabled },
      data: { disabled: !existing.disabled },
    });
    if (count === 0) throw integrationsErrors.concurrentUpdate();

    const updated = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!updated) throw integrationsErrors.apiKeyNotFound();
    return toView(updated);
  }

  async revoke(id: string): Promise<{ id: string }> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.apiKeyNotFound();

    await this.prisma.apiKey.delete({ where: { id } });
    return { id };
  }
}
