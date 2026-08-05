import {
  authorizationStateSchema,
  type AuthorizationState,
  type PlatformRole,
} from "@spm/domain-iam";
import type { PrismaService } from "../../database/prisma.service";
import type { AuthenticatedSession } from "../auth/session.service";
import type { AuthenticationFreshnessService } from "./authentication-freshness.service";

export class IamAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly freshness: AuthenticationFreshnessService,
  ) {}

  async resolve(session: AuthenticatedSession): Promise<AuthorizationState> {
    const userId = session.user.id;
    const explicitGrants = await this.prisma.scopeGrant.findMany({
      where: { userId },
      include: { role: true },
    });

    const groupMappings = session.authenticationMethod === "oidc"
      ? await this.resolveOidcMappings(userId)
      : [];

    const roles = new Set<PlatformRole>();
    const scopeGrants = [
      ...explicitGrants.map((grant) => {
        roles.add(grant.role.name as PlatformRole);
        return {
          roleName: grant.role.name as PlatformRole,
          orgScopeType: grant.orgScopeType.toLowerCase() as "group" | "sector" | "function",
          orgScopeId: grant.orgScopeId,
          source: "scope_grant" as const,
        };
      }),
      ...groupMappings.map((mapping) => {
        roles.add(mapping.role.name as PlatformRole);
        return {
          roleName: mapping.role.name as PlatformRole,
          orgScopeType: mapping.orgScopeType.toLowerCase() as "group" | "sector" | "function",
          orgScopeId: mapping.orgScopeId,
          source: "oidc_group" as const,
        };
      }),
    ];

    return authorizationStateSchema.parse({
      userId,
      roles: [...roles].sort(),
      scopeGrants,
      authenticatedAt: await this.freshness.resolve(session),
    });
  }

  private async resolveOidcMappings(userId: string) {
    const identity = await this.prisma.oidcIdentity.findFirst({
      where: { userId, lastValidatedAt: { not: null } },
      orderBy: { lastValidatedAt: "desc" },
      select: { groups: true },
    });
    if (!identity?.groups.length) return [];
    return this.prisma.groupRoleMapping.findMany({
      where: { groupClaim: { in: identity.groups }, isCurrent: true },
      include: { role: true },
    });
  }
}
