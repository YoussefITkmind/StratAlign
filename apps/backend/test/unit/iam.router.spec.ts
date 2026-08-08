import { appRouter } from "@spm/api";
import { StepUpRequiredError } from "@spm/domain-iam";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { beforeEach, describe, expect, it, vi } from "vitest";

const administratorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const session = {
  user: { id: administratorId, email: "admin@example.test", name: "Admin" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const listRoles = vi.fn();
const listGroupMappings = vi.fn();
const upsertGroupMapping = vi.fn();
const grantScope = vi.fn();
const getStepUpPolicy = vi.fn();
const authenticate = vi.fn();
const consume = vi.fn();
const reset = vi.fn();
const record = vi.fn();

function context(sessionOverride: typeof session | null = session) {
  return {
    health: { check: vi.fn() }, credentials: { authenticate },
    loginRateLimiter: { consume, reset }, clientIp: "127.0.0.1",
    session: sessionOverride, oidcIdentities: { reconcile: vi.fn() },
    auditTap: { recordCompletedCall: vi.fn().mockResolvedValue(undefined) },
    authenticationFreshness: { record }, authorization: { resolve },
    iam: {
      listRoles, listGroupMappings, upsertGroupMapping, grantScope,
      listCredentialUsers: vi.fn(), listScopeGrants: vi.fn(), getStepUpPolicy,
    },
  };
}

function authorization(roles: string[], authenticatedAt = new Date()) {
  return { userId: administratorId, roles, scopeGrants: [], authenticatedAt };
}

describe("IAM tRPC authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["platform_administrator"]));
    listRoles.mockResolvedValue([]);
    listGroupMappings.mockResolvedValue([]);
    getStepUpPolicy.mockResolvedValue({ requiresStepUp: true, maxSessionAgeSeconds: 300 });
    consume.mockResolvedValue({ allowed: true, remainingAttempts: 4, retryAfterSeconds: 900 });
    reset.mockResolvedValue(undefined);
    record.mockResolvedValue(undefined);
  });

  it("keeps unauthenticated IAM access UNAUTHORIZED", async () => {
    await expect(appRouter.createCaller(context(null)).iam.authorization())
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a missing role and allows any matching required role", async () => {
    resolve.mockResolvedValueOnce(authorization(["strategy_analyst"]));
    await expect(appRouter.createCaller(context()).iam.listRoles())
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Insufficient permissions" });

    resolve.mockResolvedValueOnce(authorization(["strategy_analyst", "platform_administrator"]));
    await expect(appRouter.createCaller(context()).iam.listRoles()).resolves.toEqual([]);
  });

  it("role-gates read procedures without loading step-up policy", async () => {
    await appRouter.createCaller(context()).iam.listRoles();
    await appRouter.createCaller(context()).iam.listGroupMappings();
    expect(getStepUpPolicy).not.toHaveBeenCalled();
  });

  it("requires mapping_change step-up for stale mapping changes", async () => {
    resolve.mockResolvedValue(authorization(
      ["platform_administrator"], new Date(Date.now() - 301_000),
    ));
    let caught: unknown;
    try {
      await appRouter.createCaller(context()).iam.upsertGroupMapping({
        groupClaim: "group-a", roleName: "strategy_analyst",
        orgScopeType: "function", orgScopeId: "platform",
      });
    } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "FORBIDDEN" });
    expect((caught as Error).message).toBe("This action requires you to re-authenticate.");
    expect((caught as { cause: StepUpRequiredError }).cause).toMatchObject({
      name: "StepUpRequiredError", actionClass: "mapping_change",
    });
  });

  it("allows a fresh mapping_change and passes only server actor identity", async () => {
    const output = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", groupClaim: "group-a",
      roleName: "strategy_analyst", orgScopeType: "function", orgScopeId: "platform",
      version: 1, isCurrent: true, supersedesId: null, createdAt: new Date(),
      createdBy: administratorId,
    };
    upsertGroupMapping.mockResolvedValue(output);
    await expect(appRouter.createCaller(context()).iam.upsertGroupMapping({
      groupClaim: "group-a", roleName: "strategy_analyst",
      orgScopeType: "function", orgScopeId: "platform",
    })).resolves.toEqual(output);
    expect(upsertGroupMapping).toHaveBeenCalledWith(expect.objectContaining({ createdBy: administratorId }));
  });

  it("requires role_grant and the exact strict grant input", async () => {
    resolve.mockResolvedValue(authorization(
      ["platform_administrator"], new Date(Date.now() - 301_000),
    ));
    let caught: unknown;
    try {
      await appRouter.createCaller(context()).iam.grantScope({
        userEmail: "target@example.test", roleName: "strategy_analyst",
        orgScopeType: "sector", orgScopeId: "north",
      });
    } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "FORBIDDEN" });
    expect((caught as { cause: StepUpRequiredError }).cause).toMatchObject({
      name: "StepUpRequiredError", actionClass: "role_grant",
    });

    resolve.mockResolvedValue(authorization(["platform_administrator"]));
    await expect(appRouter.createCaller(context()).iam.grantScope({
      userEmail: "target@example.test", roleName: "strategy_analyst",
      orgScopeType: "sector", orgScopeId: "north", userId: administratorId,
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("checks role before step-up policy and exposes no delete procedure", async () => {
    resolve.mockResolvedValue(authorization(["strategy_analyst"], new Date(0)));
    await expect(appRouter.createCaller(context()).iam.upsertGroupMapping({
      groupClaim: "group-a", roleName: "strategy_analyst",
      orgScopeType: "function", orgScopeId: "platform",
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Insufficient permissions" });
    expect(getStepUpPolicy).not.toHaveBeenCalled();
    expect((appRouter as unknown as { _def: { procedures: object } })._def.procedures)
      .not.toHaveProperty("iam.deleteGroupMapping");
  });

  it("serializes only safe step-up metadata for clients", async () => {
    resolve.mockResolvedValue(authorization(
      ["platform_administrator"], new Date(Date.now() - 301_000),
    ));
    const response = await fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("http://localhost/trpc/iam.grantScope", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userEmail: "target@example.test",
          roleName: "strategy_analyst",
          orgScopeType: "sector",
          orgScopeId: "north",
        }),
      }),
      router: appRouter,
      createContext: () => context(),
    });
    const payload = await response.json() as {
      error: { message: string; data: Record<string, unknown> };
    };
    expect(response.status).toBe(403);
    expect(payload.error.message).toBe("This action requires you to re-authenticate.");
    expect(payload.error.data).toMatchObject({
      code: "FORBIDDEN", stepUpRequired: true, actionClass: "role_grant",
    });
    expect(JSON.stringify(payload)).not.toContain("target@example.test");
  });

  it("reauthenticates credentials only for the current session identity", async () => {
    authenticate.mockResolvedValue({
      id: administratorId, email: session.user.email, displayName: session.user.name,
    });
    await expect(appRouter.createCaller(context()).iam.verifyStepUp({
      password: "correct-password",
    })).resolves.toMatchObject({ verifiedAt: expect.any(Date) });
    expect(authenticate).toHaveBeenCalledWith(session.user.email, "correct-password");
    expect(record).toHaveBeenCalledWith(session);
  });

  it("returns the same generic error for a wrong password or absent local credential", async () => {
    authenticate.mockResolvedValue(null);
    await expect(appRouter.createCaller(context()).iam.verifyStepUp({
      password: "incorrect-password",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unable to re-authenticate" });

    authenticate.mockResolvedValue({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: session.user.email, displayName: null,
    });
    await expect(appRouter.createCaller(context()).iam.verifyStepUp({
      password: "different-user-password",
    })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Unable to re-authenticate" });
    expect(record).not.toHaveBeenCalled();
  });

  it("rate-limits failed credentials step-up attempts", async () => {
    consume.mockResolvedValue({ allowed: false, remainingAttempts: 0, retryAfterSeconds: 600 });
    await expect(appRouter.createCaller(context()).iam.verifyStepUp({
      password: "incorrect-password",
    })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "Unable to re-authenticate" });
    expect(authenticate).not.toHaveBeenCalled();
  });
});
