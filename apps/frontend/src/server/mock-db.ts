/**
 * ⚠️ MOCK BACKEND — LOCAL DEV/TEST FIXTURE ONLY, NOT REAL PERSISTENCE.
 *
 * Tracks A (IAM / Prompt 1.2), C (Audit / Prompt 1.3), and the Workflow
 * engine (Prompt 1.5) don't exist anywhere in this repository yet — there is
 * no database, no real `GroupRoleMapping` table, no audit journal, no
 * governance case engine. This file is an in-memory stand-in so Track D's
 * UIs (STRAAL-34/35/36) have something real (if fake) to call through tRPC
 * while those backend prompts are built. Every procedure that touches this
 * store performs the same authorization/validation a real backend would, so
 * the UI is exercising real request/response shapes — only the storage
 * layer and data are fake.
 *
 * DELETE THIS FILE once Prompts 1.2/1.3/1.5 ship real routers, and repoint
 * `server/routers/*` at the real ones instead.
 */

export type Role = "platform_administrator" | "member";

export type MockUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  authMethod: "credentials" | "oidc";
};

export type GroupRoleMapping = {
  id: string;
  groupName: string;
  role: Role;
  orgScope: string;
  createdAt: string;
  updatedAt: string;
};

export type UserRoleGrant = {
  id: string;
  userId: string;
  role: Role;
  orgScope: string;
  grantedBy: string;
  grantedAt: string;
};

export type AuditEntry = {
  id: string;
  eventType: string;
  actor: string;
  timestamp: string;
  details?: string;
};

export type GovernanceCaseStatus = "pending" | "approved" | "rejected";

export type GovernanceCase = {
  id: string;
  caseType: string;
  submittedBy: string;
  status: GovernanceCaseStatus;
  escalated: boolean;
  proposedChange: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionReason?: string;
};

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function seedState() {
  return {
    users: [
      {
        id: "demo-user",
        email: "demo@stratalign.dev",
        name: "Demo User",
        role: "member" as const,
        authMethod: "credentials" as const,
      },
      {
        id: "demo-admin",
        email: "admin@stratalign.dev",
        name: "Ada Minsky",
        role: "platform_administrator" as const,
        authMethod: "credentials" as const,
      },
      {
        id: "oidc-user",
        email: "sso.member@stratalign.dev",
        name: "SSO Member",
        role: "member" as const,
        authMethod: "oidc" as const,
      },
      {
        id: "oidc-admin",
        email: "sso.admin@stratalign.dev",
        name: "SSO Admin",
        role: "platform_administrator" as const,
        authMethod: "oidc" as const,
      },
    ] as MockUser[],
    groupRoleMappings: [
      {
        id: id("grm"),
        groupName: "stratalign-eng-leads",
        role: "platform_administrator",
        orgScope: "org:global",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      },
      {
        id: id("grm"),
        groupName: "stratalign-analysts",
        role: "member",
        orgScope: "org:emea",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      },
    ] as GroupRoleMapping[],
    userRoleGrants: [] as UserRoleGrant[],
    auditLog: [
      {
        id: id("audit"),
        eventType: "auth.login.success",
        actor: "demo@stratalign.dev",
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        details: "Credentials sign-in",
      },
    ] as AuditEntry[],
    governanceCases: [
      {
        id: "case-seed-role-grant",
        caseType: "role_grant",
        submittedBy: "admin@stratalign.dev",
        status: "pending",
        escalated: false,
        proposedChange: {
          before: { role: "member", orgScope: "org:emea" },
          after: { role: "platform_administrator", orgScope: "org:emea" },
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      },
      {
        id: "case-seed-group-mapping",
        caseType: "group_role_mapping_change",
        submittedBy: "demo@stratalign.dev",
        status: "pending",
        escalated: true,
        proposedChange: {
          before: { groupName: "stratalign-analysts", role: "member" },
          after: { groupName: "stratalign-analysts", role: "platform_administrator" },
        },
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      },
    ] as GovernanceCase[],
    /** userId -> ISO timestamp of last successful step-up re-auth. */
    stepUpVerifications: new Map<string, string>(),
  };
}

/**
 * Next.js dev mode compiles each Route Handler (NextAuth's route, the tRPC
 * catch-all route) as its own webpack entry. A plain module-level array can
 * end up duplicated per entry point whenever only some of them recompile,
 * silently resetting state (grants "disappearing", audit entries not
 * showing up). Anchoring to `globalThis` guarantees every entry point reads
 * and writes the same objects — the same fix used for singletons like a
 * dev-mode Prisma client.
 */
const globalForMockDb = globalThis as unknown as { __stratalignMockDb?: ReturnType<typeof seedState> };
const state = globalForMockDb.__stratalignMockDb ?? seedState();
globalForMockDb.__stratalignMockDb = state;

export const MOCK_USERS = state.users;
export const groupRoleMappings = state.groupRoleMappings;
export const userRoleGrants = state.userRoleGrants;
export const auditLog = state.auditLog;
export const governanceCases = state.governanceCases;
export const stepUpVerifications = state.stepUpVerifications;

export function recordAudit(eventType: string, actor: string, details?: string) {
  auditLog.unshift({
    id: id("audit"),
    eventType,
    actor,
    timestamp: new Date().toISOString(),
    details,
  });
}

export function findUserByEmail(email: string) {
  return MOCK_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(userId: string) {
  return MOCK_USERS.find((u) => u.id === userId);
}

export { id as genId };
