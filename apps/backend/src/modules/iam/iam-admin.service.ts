import type {
  OrgScopeType,
  PlatformRole,
} from "@spm/domain-iam";
import type { SafeGroupMapping, SafeScopeGrant } from "@spm/api";
import type { PrismaService } from "../../database/prisma.service";

export class IamOperationError extends Error {
  readonly code = "IAM_OPERATION_FAILED";
  constructor() {
    super("Unable to complete IAM operation");
    this.name = "IamOperationError";
  }
}

function prismaScopeType(type: OrgScopeType): "GROUP" | "SECTOR" | "FUNCTION" {
  return type.toUpperCase() as "GROUP" | "SECTOR" | "FUNCTION";
}

export class IamAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(): Promise<Array<{ id: string; name: PlatformRole; description: string }>> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true },
    });
    return roles.map((role) => ({ ...role, name: role.name as PlatformRole }));
  }

  async listGroupMappings(): Promise<SafeGroupMapping[]> {
    const mappings = await this.prisma.groupRoleMapping.findMany({
      where: { isCurrent: true },
      include: { role: true },
      orderBy: { groupClaim: "asc" },
    });
    return mappings.map((mapping) => this.safeMapping(mapping));
  }

  async upsertGroupMapping(input: {
    groupClaim: string;
    roleName: PlatformRole;
    orgScopeType: OrgScopeType;
    orgScopeId: string;
    createdBy: string;
  }): Promise<SafeGroupMapping> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const role = await transaction.role.findUnique({ where: { name: input.roleName } });
        if (!role) throw new IamOperationError();
        const current = await transaction.groupRoleMapping.findFirst({
          where: { groupClaim: input.groupClaim, isCurrent: true },
        });
        const latest = current ?? await transaction.groupRoleMapping.findFirst({
          where: { groupClaim: input.groupClaim },
          orderBy: { version: "desc" },
        });
        if (current) {
          await transaction.groupRoleMapping.update({
            where: { id: current.id },
            data: { isCurrent: false },
          });
        }
        const created = await transaction.groupRoleMapping.create({
          data: {
            groupClaim: input.groupClaim,
            roleId: role.id,
            orgScopeType: prismaScopeType(input.orgScopeType),
            orgScopeId: input.orgScopeId,
            version: (latest?.version ?? 0) + 1,
            supersedesId: latest?.id,
            createdById: input.createdBy,
          },
          include: { role: true },
        });
        return this.safeMapping(created);
      });
    } catch (error) {
      if (error instanceof IamOperationError) throw error;
      throw new IamOperationError();
    }
  }

  async grantScope(input: {
    userEmail: string;
    roleName: PlatformRole;
    orgScopeType: OrgScopeType;
    orgScopeId: string;
    grantedBy: string;
  }): Promise<SafeScopeGrant> {
    try {
      const email = input.userEmail.trim().toLowerCase();
      const [user, role] = await Promise.all([
        this.prisma.user.findUnique({ where: { email } }),
        this.prisma.role.findUnique({ where: { name: input.roleName } }),
      ]);
      if (!user || !role) throw new IamOperationError();
      const grant = await this.prisma.scopeGrant.upsert({
        where: {
          userId_roleId_orgScopeType_orgScopeId: {
            userId: user.id,
            roleId: role.id,
            orgScopeType: prismaScopeType(input.orgScopeType),
            orgScopeId: input.orgScopeId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: role.id,
          orgScopeType: prismaScopeType(input.orgScopeType),
          orgScopeId: input.orgScopeId,
          grantedById: input.grantedBy,
        },
      });
      return {
        id: grant.id,
        userId: grant.userId,
        roleName: input.roleName,
        orgScopeType: input.orgScopeType,
        orgScopeId: grant.orgScopeId,
        grantedAt: grant.grantedAt,
        grantedBy: grant.grantedById,
      };
    } catch (error) {
      if (error instanceof IamOperationError) throw error;
      throw new IamOperationError();
    }
  }

  async listCredentialUsers() {
    return this.prisma.user.findMany({
      where: { localCredential: { isNot: null } },
      orderBy: { email: "asc" },
      select: { id: true, email: true, displayName: true },
    });
  }

  async listScopeGrants() {
    const grants = await this.prisma.scopeGrant.findMany({
      include: { role: true },
      orderBy: { grantedAt: "desc" },
    });
    return grants.map((grant) => ({
      id: grant.id,
      userId: grant.userId,
      roleName: grant.role.name,
      orgScopeType: grant.orgScopeType.toLowerCase(),
      orgScopeId: grant.orgScopeId,
      grantedAt: grant.grantedAt,
      grantedBy: grant.grantedById,
    }));
  }

  async getStepUpPolicy(actionClass: string) {
    return this.prisma.stepUpPolicy.findUnique({ where: { actionClass } });
  }

  private safeMapping(mapping: {
    id: string;
    groupClaim: string;
    role: { name: string };
    orgScopeType: string;
    orgScopeId: string;
    version: number;
    isCurrent: boolean;
    supersedesId: string | null;
    createdAt: Date;
    createdById: string;
  }) {
    return {
      id: mapping.id,
      groupClaim: mapping.groupClaim,
      roleName: mapping.role.name as PlatformRole,
      orgScopeType: mapping.orgScopeType.toLowerCase() as OrgScopeType,
      orgScopeId: mapping.orgScopeId,
      version: mapping.version,
      isCurrent: mapping.isCurrent,
      supersedesId: mapping.supersedesId,
      createdAt: mapping.createdAt,
      createdBy: mapping.createdById,
    };
  }
}
