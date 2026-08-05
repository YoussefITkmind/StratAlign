import { z } from "zod";
import { orgScopeTypeSchema, platformRoleSchema, type PlatformRole } from "@spm/domain-iam";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendIamClient, translateBackendIamError } from "@/server/backend-iam-client";

const orgScopeSchema = z.string().trim().min(3).max(220);

function splitScope(value: string) {
  const separator = value.indexOf(":");
  const type = orgScopeTypeSchema.safeParse(value.slice(0, separator));
  const id = value.slice(separator + 1).trim();
  if (separator < 1 || !type.success || !id) {
    throw new Error("Use group:, sector:, or function: followed by a scope identifier.");
  }
  return { orgScopeType: type.data, orgScopeId: id };
}

function backend(ctx: { cookieHeader: string | null }) {
  return createBackendIamClient(ctx.cookieHeader);
}

export const iamRouter = router({
  listGroupRoleMappings: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      const mappings = await backend(ctx).iam.listGroupMappings.query();
      return mappings.map((mapping) => ({
        id: mapping.id,
        groupName: mapping.groupClaim,
        role: mapping.roleName,
        orgScope: `${mapping.orgScopeType}:${mapping.orgScopeId}`,
        createdAt: String(mapping.createdAt),
        updatedAt: String(mapping.createdAt),
      }));
    } catch (error) { translateBackendIamError(error); }
  }),

  createGroupRoleMapping: authenticatedProcedure.input(z.object({
    groupName: z.string().trim().min(1).max(200),
    role: platformRoleSchema,
    orgScope: orgScopeSchema,
  }).strict()).mutation(async ({ ctx, input }) => {
    try {
      const mapping = await backend(ctx).iam.upsertGroupMapping.mutate({
        groupClaim: input.groupName,
        roleName: input.role,
        ...splitScope(input.orgScope),
      });
      return {
        id: mapping.id, groupName: mapping.groupClaim, role: mapping.roleName,
        orgScope: `${mapping.orgScopeType}:${mapping.orgScopeId}`,
        createdAt: String(mapping.createdAt), updatedAt: String(mapping.createdAt),
      };
    } catch (error) { translateBackendIamError(error); }
  }),

  updateGroupRoleMapping: authenticatedProcedure.input(z.object({
    id: z.string().uuid(), role: platformRoleSchema, orgScope: orgScopeSchema,
  }).strict()).mutation(async ({ ctx, input }) => {
    try {
      const current = await backend(ctx).iam.listGroupMappings.query();
      const existing = current.find((mapping) => mapping.id === input.id);
      if (!existing) throw new Error("Mapping not found");
      const mapping = await backend(ctx).iam.upsertGroupMapping.mutate({
        groupClaim: existing.groupClaim,
        roleName: input.role,
        ...splitScope(input.orgScope),
      });
      return {
        id: mapping.id, groupName: mapping.groupClaim, role: mapping.roleName,
        orgScope: `${mapping.orgScopeType}:${mapping.orgScopeId}`,
        createdAt: String(mapping.createdAt), updatedAt: String(mapping.createdAt),
      };
    } catch (error) { translateBackendIamError(error); }
  }),

  listCredentialUsers: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      const users = await backend(ctx).iam.listCredentialUsers.query() as Array<{
        id: string; email: string; displayName: string | null;
      }>;
      return users.map((user) => ({
        id: user.id, email: user.email, name: user.displayName ?? user.email,
      }));
    } catch (error) { translateBackendIamError(error); }
  }),

  listUserRoleGrants: authenticatedProcedure.query(async ({ ctx }) => {
    try {
      const grants = await backend(ctx).iam.listScopeGrants.query() as Array<{
        id: string; userId: string; roleName: PlatformRole; orgScopeType: string;
        orgScopeId: string; grantedBy: string; grantedAt: string | Date;
      }>;
      return grants.map((grant) => ({
        id: grant.id, userId: grant.userId, role: grant.roleName,
        orgScope: `${grant.orgScopeType}:${grant.orgScopeId}`,
        grantedBy: grant.grantedBy, grantedAt: String(grant.grantedAt),
      }));
    } catch (error) { translateBackendIamError(error); }
  }),

  grantUserRoleScope: authenticatedProcedure.input(z.object({
    userId: z.string().uuid(), role: platformRoleSchema, orgScope: orgScopeSchema,
  }).strict()).mutation(async ({ ctx, input }) => {
    try {
      const users = await backend(ctx).iam.listCredentialUsers.query() as Array<{
        id: string; email: string;
      }>;
      const user = users.find((candidate) => candidate.id === input.userId);
      if (!user) throw new Error("User not found");
      const grant = await backend(ctx).iam.grantScope.mutate({
        userEmail: user.email, roleName: input.role, ...splitScope(input.orgScope),
      });
      return {
        id: grant.id, userId: grant.userId, role: grant.roleName,
        orgScope: `${grant.orgScopeType}:${grant.orgScopeId}`,
        grantedBy: grant.grantedBy, grantedAt: String(grant.grantedAt),
      };
    } catch (error) { translateBackendIamError(error); }
  }),

  verifyStepUp: authenticatedProcedure.input(z.object({
    password: z.string().min(1).max(256),
  }).strict()).mutation(async ({ ctx, input }) => {
    try {
      const result = await backend(ctx).iam.verifyStepUp.mutate(input);
      return { verifiedAt: String(result.verifiedAt) };
    } catch (error) { translateBackendIamError(error); }
  }),
});
