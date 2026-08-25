import { rootRouter } from "@spm/api/root";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests for the Data & Integrations tRPC surface.
 *
 * Services are mocked so a failure here is unambiguously a router problem —
 * who may call it, what input it accepts, and what a caller is told when the
 * service throws.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const connectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const apiKeyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const webhookId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const session = {
  user: { id: userId, email: "steward@example.test", name: "Data Steward" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const recordCompletedCall = vi.fn();

const connectionsList = vi.fn();
const connectionsToggle = vi.fn();
const connectionsSyncNow = vi.fn();
const syncLogsList = vi.fn();
const syncInvestigate = vi.fn();
const apiKeysList = vi.fn();
const apiKeysCreate = vi.fn();
const apiKeysToggleDisabled = vi.fn();
const apiKeysRevoke = vi.fn();
const webhooksList = vi.fn();
const webhooksCreate = vi.fn();
const webhooksToggleActive = vi.fn();
const webhooksDelete = vi.fn();

function context(sessionOverride: typeof session | null = session) {
  return {
    health: { check: vi.fn() },
    credentials: { authenticate: vi.fn() },
    loginRateLimiter: { consume: vi.fn(), reset: vi.fn() },
    clientIp: "127.0.0.1",
    session: sessionOverride,
    oidcIdentities: { reconcile: vi.fn() },
    auditTap: { recordCompletedCall },
    authenticationFreshness: { record: vi.fn() },
    authorization: { resolve },
    iam: { getStepUpPolicy: vi.fn() },
    rules: {},
    audit: {},
    registry: {},
    integrations: {
      connections: { list: connectionsList, toggle: connectionsToggle, syncNow: connectionsSyncNow },
      syncLogs: { list: syncLogsList },
      syncInvestigation: { investigate: syncInvestigate },
      apiKeys: {
        list: apiKeysList,
        create: apiKeysCreate,
        toggleDisabled: apiKeysToggleDisabled,
        revoke: apiKeysRevoke,
      },
      webhooks: {
        list: webhooksList,
        create: webhooksCreate,
        toggleActive: webhooksToggleActive,
        delete: webhooksDelete,
      },
    },
  };
}

function authorization(roles: string[]) {
  return { userId, roles, scopeGrants: [], authenticatedAt: new Date() };
}

const connectionOutput = {
  id: connectionId,
  name: "Salesforce CRM",
  category: "CRM",
  status: "CONNECTED" as const,
  direction: "Bi-directional",
  lastSync: "Last: just now",
  recordsIn: 100,
  recordsOut: 50,
  meta: "OAuth 2.0",
  color: "bg-blue-500",
  icon: "SF",
};

const apiKeyOutput = {
  id: apiKeyId,
  name: "Mobile App",
  scope: "READ" as const,
  keyPreview: "bsc_rd_sk_••••••••••••••••",
  owner: "Alex Morgan",
  created: "Jan 1, 2026",
  expires: "Jan 1, 2027",
  lastUsed: "Never",
  requests: 0,
  disabled: false,
};

const syncLogId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const investigationOutput = {
  syncLogId,
  integration: "Snowflake ETL Service",
  kind: "SYNC_FAILURE" as const,
  source: "ai" as const,
  diagnosis: "The source system rejected the credential supplied by this integration.",
  likelyCause: "An expired or revoked authentication credential.",
  confidence: "medium" as const,
  evidence: ["The run reported 3 errors."],
  recommendedActions: ["Check the source credentials for this integration."],
  insufficientData: false,
  insufficientReasons: [],
  volume: null,
  evidenceLogCount: 4,
  generatedAt: "2026-08-25T09:00:00.000Z",
};

const webhookOutput = {
  id: webhookId,
  name: "Forecast Update",
  url: "https://example.test/webhook",
  events: ["forecast.updated"],
  active: true,
  successRate: 100,
};

describe("integrations tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["data_steward"]));
    recordCompletedCall.mockResolvedValue(undefined);
    connectionsList.mockResolvedValue([connectionOutput]);
    connectionsToggle.mockResolvedValue({ ...connectionOutput, status: "DISCONNECTED" });
    connectionsSyncNow.mockResolvedValue(connectionOutput);
    syncLogsList.mockResolvedValue([]);
    syncInvestigate.mockResolvedValue(investigationOutput);
    apiKeysList.mockResolvedValue([apiKeyOutput]);
    apiKeysCreate.mockResolvedValue({ ...apiKeyOutput, secret: "bsc_rd_sk_realsecretvalue" });
    apiKeysToggleDisabled.mockResolvedValue({ ...apiKeyOutput, disabled: true });
    apiKeysRevoke.mockResolvedValue({ id: apiKeyId });
    webhooksList.mockResolvedValue([webhookOutput]);
    webhooksCreate.mockResolvedValue(webhookOutput);
    webhooksToggleActive.mockResolvedValue({ ...webhookOutput, active: false });
    webhooksDelete.mockResolvedValue({ id: webhookId });
  });

  describe("authentication", () => {
    it("refuses every integrations procedure without a session", async () => {
      const caller = rootRouter.createCaller(context(null) as never);

      await expect(caller.integrations.connections.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(caller.integrations.syncLogs.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(caller.integrations.apiKeys.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(caller.integrations.webhooks.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(caller.integrations.syncLogs.investigate({ syncLogId })).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });

      expect(connectionsList).not.toHaveBeenCalled();
      expect(syncLogsList).not.toHaveBeenCalled();
      expect(syncInvestigate).not.toHaveBeenCalled();
      expect(apiKeysList).not.toHaveBeenCalled();
      expect(webhooksList).not.toHaveBeenCalled();
    });
  });

  describe("role gating", () => {
    it("lets platform_administrator and data_steward manage integrations", async () => {
      for (const role of ["platform_administrator", "data_steward"]) {
        resolve.mockResolvedValueOnce(authorization([role]));
        const caller = rootRouter.createCaller(context() as never);
        await expect(caller.integrations.connections.list()).resolves.toEqual([connectionOutput]);
      }
    });

    it("rejects every other role", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.integrations.connections.list()).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        caller.integrations.webhooks.create({ name: "x", url: "https://example.test", events: [] }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.integrations.syncLogs.investigate({ syncLogId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(syncInvestigate).not.toHaveBeenCalled();
    });
  });

  /**
   * The investigation surface carries model output to a browser, so the router
   * is the last place that can stop a malformed or over-specific answer. These
   * tests pin what a caller may send, what they get back, and — most
   * importantly — that a provider outage is not reported as a bad request.
   */
  describe("sync investigation", () => {
    it("investigates a sync log and returns the structured diagnosis", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.integrations.syncLogs.investigate({ syncLogId })).resolves.toEqual(
        investigationOutput,
      );
      expect(syncInvestigate).toHaveBeenCalledWith(syncLogId);
    });

    it("returns an explicit insufficient-data result unchanged", async () => {
      syncInvestigate.mockResolvedValueOnce({
        ...investigationOutput,
        source: "deterministic",
        kind: "NO_ANOMALY",
        diagnosis: "Insufficient data to determine the likely cause.",
        likelyCause: null,
        confidence: "low",
        insufficientData: true,
        insufficientReasons: ["NO_HISTORICAL_VOLUME"],
      });
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.integrations.syncLogs.investigate({ syncLogId })).resolves.toMatchObject({
        insufficientData: true,
        likelyCause: null,
        confidence: "low",
        source: "deterministic",
      });
    });

    it("rejects a malformed sync log id before reaching the service", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.integrations.syncLogs.investigate({ syncLogId: "not-a-uuid" }),
      ).rejects.toBeDefined();
      expect(syncInvestigate).not.toHaveBeenCalled();
    });

    it("rejects an attempt to smuggle extra input past the schema", async () => {
      const caller = rootRouter.createCaller(context() as never);

      await expect(
        caller.integrations.syncLogs.investigate({
          syncLogId,
          diagnosis: "the token expired",
        } as never),
      ).rejects.toBeDefined();
      expect(syncInvestigate).not.toHaveBeenCalled();
    });

    it("maps an unknown sync log to NOT_FOUND", async () => {
      syncInvestigate.mockRejectedValueOnce(
        Object.assign(new Error("Sync log entry was not found"), {
          code: "INTEGRATIONS_SYNC_LOG_NOT_FOUND",
        }),
      );
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.integrations.syncLogs.investigate({ syncLogId })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it.each([
      ["AI_UNAVAILABLE", "SERVICE_UNAVAILABLE"],
      ["AI_TIMEOUT", "TIMEOUT"],
      ["AI_MALFORMED_OUTPUT", "UNPROCESSABLE_CONTENT"],
    ])("maps a provider %s failure to %s", async (serviceCode, trpcCode) => {
      syncInvestigate.mockRejectedValueOnce(
        Object.assign(new Error("upstream detail that must not leak"), { code: serviceCode }),
      );
      const caller = rootRouter.createCaller(context() as never);

      const error = await caller.integrations.syncLogs
        .investigate({ syncLogId })
        .then(() => null)
        .catch((thrown: unknown) => thrown as { code: string; message: string });

      expect(error?.code).toBe(trpcCode);
      expect(error?.message).not.toContain("upstream detail");
    });

    it("does not leak an unexpected service failure to the caller", async () => {
      syncInvestigate.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.4:5432"));
      const caller = rootRouter.createCaller(context() as never);

      const error = await caller.integrations.syncLogs
        .investigate({ syncLogId })
        .then(() => null)
        .catch((thrown: unknown) => thrown as { code: string; message: string });

      expect(error?.code).toBe("INTERNAL_SERVER_ERROR");
      expect(error?.message).toBe("Unable to investigate this sync run");
    });

    it("refuses model output that fails the response contract", async () => {
      syncInvestigate.mockResolvedValueOnce({
        ...investigationOutput,
        confidence: "certain",
      });
      const caller = rootRouter.createCaller(context() as never);

      await expect(caller.integrations.syncLogs.investigate({ syncLogId })).rejects.toBeDefined();
    });
  });

  describe("connections", () => {
    it("lists connections", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(caller.integrations.connections.list()).resolves.toEqual([connectionOutput]);
    });

    it("toggles a connection", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.connections.toggle({ id: connectionId }),
      ).resolves.toMatchObject({ status: "DISCONNECTED" });
      expect(connectionsToggle).toHaveBeenCalledWith(connectionId);
    });

    it("syncs a connection now", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(caller.integrations.connections.syncNow({ id: connectionId })).resolves.toEqual(
        connectionOutput,
      );
      expect(connectionsSyncNow).toHaveBeenCalledWith(connectionId);
    });

    it("rejects a malformed connection id", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.connections.toggle({ id: "not-a-uuid" }),
      ).rejects.toBeDefined();
      expect(connectionsToggle).not.toHaveBeenCalled();
    });

    it("maps a thrown service error to BAD_REQUEST", async () => {
      connectionsToggle.mockRejectedValueOnce(new Error("Connection was not found"));
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.connections.toggle({ id: connectionId }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Connection was not found" });
    });
  });

  describe("apiKeys", () => {
    it("creates an api key using the caller's identity as owner", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.apiKeys.create({ name: "Mobile App", scope: "READ" }),
      ).resolves.toMatchObject({ secret: "bsc_rd_sk_realsecretvalue" });
      expect(apiKeysCreate).toHaveBeenCalledWith({
        name: "Mobile App",
        scope: "READ",
        ownerId: userId,
        ownerName: "Data Steward",
      });
    });

    it("rejects an invalid scope", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.apiKeys.create({ name: "x", scope: "SUPERUSER" as never }),
      ).rejects.toBeDefined();
      expect(apiKeysCreate).not.toHaveBeenCalled();
    });

    it("revokes an api key", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(caller.integrations.apiKeys.revoke({ id: apiKeyId })).resolves.toEqual({
        id: apiKeyId,
      });
    });
  });

  describe("webhooks", () => {
    it("creates a webhook", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.webhooks.create({
          name: "Forecast Update",
          url: "https://example.test/webhook",
          events: ["forecast.updated"],
        }),
      ).resolves.toEqual(webhookOutput);
    });

    it("rejects a non-URL endpoint", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(
        caller.integrations.webhooks.create({ name: "x", url: "not-a-url", events: [] }),
      ).rejects.toBeDefined();
      expect(webhooksCreate).not.toHaveBeenCalled();
    });

    it("deletes a webhook", async () => {
      const caller = rootRouter.createCaller(context() as never);
      await expect(caller.integrations.webhooks.delete({ id: webhookId })).resolves.toEqual({
        id: webhookId,
      });
    });
  });
});
