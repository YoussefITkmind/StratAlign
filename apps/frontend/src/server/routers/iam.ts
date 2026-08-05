import { z } from "zod";
import { adminProcedure, requireStepUp, router } from "@/server/trpc";
import {
  MOCK_USERS,
  findUserById,
  genId,
  groupRoleMappings,
  recordAudit,
  stepUpVerifications,
  userRoleGrants,
} from "@/server/mock-db";

const roleSchema = z.enum(["platform_administrator", "member"]);

export const iamRouter = router({
  listGroupRoleMappings: adminProcedure.query(() => {
    return [...groupRoleMappings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }),

  createGroupRoleMapping: adminProcedure
    .input(
      z.object({
        groupName: z.string().min(1),
        role: roleSchema,
        orgScope: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      requireStepUp(ctx);
      const now = new Date().toISOString();
      const mapping = { id: genId("grm"), createdAt: now, updatedAt: now, ...input };
      groupRoleMappings.push(mapping);
      recordAudit("iam.group_role_mapping.created", ctx.user.email, JSON.stringify(mapping));
      return mapping;
    }),

  updateGroupRoleMapping: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: roleSchema,
        orgScope: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      requireStepUp(ctx);
      const mapping = groupRoleMappings.find((m) => m.id === input.id);
      if (!mapping) throw new Error("Mapping not found.");
      mapping.role = input.role;
      mapping.orgScope = input.orgScope;
      mapping.updatedAt = new Date().toISOString();
      recordAudit("iam.group_role_mapping.updated", ctx.user.email, JSON.stringify(mapping));
      return mapping;
    }),

  listCredentialUsers: adminProcedure.query(() => {
    return MOCK_USERS.filter((u) => u.authMethod === "credentials").map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
    }));
  }),

  listUserRoleGrants: adminProcedure.query(() => {
    return [...userRoleGrants].sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
  }),

  grantUserRoleScope: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: roleSchema,
        orgScope: z.string().min(1),
      })
    )
    .mutation(({ ctx, input }) => {
      requireStepUp(ctx);
      const targetUser = findUserById(input.userId);
      if (!targetUser || targetUser.authMethod !== "credentials") {
        throw new Error("Target must be an existing credentials-based user.");
      }
      const grant = {
        id: genId("grant"),
        userId: input.userId,
        role: input.role,
        orgScope: input.orgScope,
        grantedBy: ctx.user.email,
        grantedAt: new Date().toISOString(),
      };
      userRoleGrants.push(grant);
      targetUser.role = input.role;
      recordAudit(
        "iam.user_role_grant.created",
        ctx.user.email,
        `Granted ${input.role} @ ${input.orgScope} to ${targetUser.email}`
      );
      return grant;
    }),

  verifyStepUp: adminProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ ctx, input }) => {
      // Mirrors the credentials provider's demo check (lib/auth/auth.ts) —
      // real Prompt 1.2 should re-verify against iam.local_credential.
      const validPasswords: Record<string, string> = {
        "demo@stratalign.dev": "password123",
        "admin@stratalign.dev": "admin123",
      };
      if (validPasswords[ctx.user.email] !== input.password) {
        throw new Error("That password isn't right.");
      }
      stepUpVerifications.set(ctx.user.id, new Date().toISOString());
      recordAudit("iam.step_up.verified", ctx.user.email);
      return { verifiedAt: new Date().toISOString() };
    }),
});
