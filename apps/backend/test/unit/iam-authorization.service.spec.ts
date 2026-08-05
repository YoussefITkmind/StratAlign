import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import { IamAuthorizationService } from "../../src/modules/iam/iam-authorization.service";
import type { AuthenticationFreshnessService } from "../../src/modules/iam/authentication-freshness.service";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const authenticatedAt = new Date("2026-08-05T12:00:00Z");
const privateSession = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date("2026-08-05T12:15:00Z"),
};

function harness() {
  const findGrants = vi.fn().mockResolvedValue([]);
  const findIdentity = vi.fn().mockResolvedValue(null);
  const findMappings = vi.fn().mockResolvedValue([]);
  const resolveFreshness = vi.fn().mockResolvedValue(authenticatedAt);
  const prisma = {
    scopeGrant: { findMany: findGrants },
    oidcIdentity: { findFirst: findIdentity },
    groupRoleMapping: { findMany: findMappings },
  } as unknown as PrismaService;
  const freshness = { resolve: resolveFreshness } as unknown as AuthenticationFreshnessService;
  return {
    service: new IamAuthorizationService(prisma, freshness),
    findGrants, findIdentity, findMappings,
  };
}

describe("IamAuthorizationService", () => {
  it("derives credentials authorization only from ScopeGrant", async () => {
    const test = harness();
    test.findGrants.mockResolvedValue([{
      role: { name: "strategy_analyst" }, orgScopeType: "SECTOR", orgScopeId: "north",
    }]);
    const state = await test.service.resolve({
      user: { id: userId, email: "user@example.test", name: null },
      authenticatedAt, authenticationMethod: "credentials", ...privateSession,
    });
    expect(state.roles).toEqual(["strategy_analyst"]);
    expect(state.scopeGrants).toEqual([{
      roleName: "strategy_analyst", orgScopeType: "sector",
      orgScopeId: "north", source: "scope_grant",
    }]);
    expect(test.findIdentity).not.toHaveBeenCalled();
  });

  it("derives OIDC roles only from latest validated stored groups and current mappings", async () => {
    const test = harness();
    test.findIdentity.mockResolvedValue({ groups: ["trusted-group"] });
    test.findMappings.mockResolvedValue([{
      role: { name: "sector_leadership" }, orgScopeType: "GROUP", orgScopeId: "trusted-group",
    }]);
    const state = await test.service.resolve({
      user: { id: userId, email: "user@example.test", name: null },
      authenticatedAt, authenticationMethod: "oidc", ...privateSession,
    });
    expect(state.roles).toEqual(["sector_leadership"]);
    expect(test.findMappings).toHaveBeenCalledWith(expect.objectContaining({
      where: { groupClaim: { in: ["trusted-group"] }, isCurrent: true },
    }));
  });

  it("ignores browser/session roles and groups", async () => {
    const test = harness();
    const state = await test.service.resolve({
      user: {
        id: userId, email: "user@example.test", name: null,
        roles: ["platform_administrator"], groups: ["attacker-group"],
      } as never,
      authenticatedAt, authenticationMethod: "credentials", ...privateSession,
    });
    expect(state.roles).toEqual([]);
    expect(test.findMappings).not.toHaveBeenCalled();
  });
});
