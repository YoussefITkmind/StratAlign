import { appRouter } from "@spm/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const measurementId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const sessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ruleVersionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

const session = {
  user: { id: userId, email: "owner@example.test", name: "Owner" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const startCaptureSession = vi.fn();
const submitCaptureSession = vi.fn();
const recallCaptureSession = vi.fn();
const listMeasurements = vi.fn();
const addCommentary = vi.fn();
const getStatus = vi.fn();
const getRollup = vi.fn();
const recordCompletedCall = vi.fn();

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
    iam: {
      listRoles: vi.fn(),
      listGroupMappings: vi.fn(),
      upsertGroupMapping: vi.fn(),
      grantScope: vi.fn(),
      listCredentialUsers: vi.fn(),
      listScopeGrants: vi.fn(),
      getStepUpPolicy: vi.fn(),
    },
    performance: {
      startCaptureSession,
      submitCaptureSession,
      recallCaptureSession,
      listMeasurements,
      addCommentary,
      getStatus,
      getRollup,
    },
  };
}

function authorization(roles: string[]) {
  return {
    userId,
    roles,
    scopeGrants: [],
    authenticatedAt: new Date(),
  };
}

const captureSession = {
  id: sessionId,
  kpiVersionId: "kpi-version-alpha",
  scopeNodeId: "scope-north",
  period: "2026-Q1",
  state: "DRAFT" as const,
  ownerId: userId,
  submittedMeasurementId: null,
  submittedAt: null,
  recalledAt: null,
  recallDeadlineAt: null,
  consumedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const measurement = {
  id: measurementId,
  kpiVersionId: "kpi-version-alpha",
  scopeNodeId: "scope-north",
  period: "2026-Q1",
  value: 90,
  source: "MANUAL" as const,
  locked: false,
  supersedesId: null,
  submittedBy: userId,
  evidenceRef: null,
  createdAt: new Date(),
};

const startInput = {
  kpiVersionId: "kpi-version-alpha",
  scopeNodeId: "scope-north",
  period: "2026-Q1",
};

describe("performance tRPC router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["kpi_owner"]));
    recordCompletedCall.mockResolvedValue(undefined);
    startCaptureSession.mockResolvedValue(captureSession);
    submitCaptureSession.mockResolvedValue({
      session: { ...captureSession, state: "SUBMITTED" },
      measurement,
    });
    recallCaptureSession.mockResolvedValue({
      ...captureSession,
      state: "RECALLED",
    });
    listMeasurements.mockResolvedValue([measurement]);
    addCommentary.mockResolvedValue({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      kpiVersionId: "kpi-version-alpha",
      scopeNodeId: "scope-north",
      period: "2026-Q1",
      authorId: userId,
      bodyEn: "Recovered",
      bodyAr: null,
      createdAt: new Date(),
    });
    getStatus.mockResolvedValue(null);
    getRollup.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  describe("authentication", () => {
    it("rejects unauthenticated capture mutations", async () => {
      await expect(
        appRouter
          .createCaller(context(null))
          .performance.capture.startSession(startInput),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      expect(startCaptureSession).not.toHaveBeenCalled();
    });

    it("rejects unauthenticated reads", async () => {
      await expect(
        appRouter
          .createCaller(context(null))
          .performance.measurement.list({ limit: 10 }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      await expect(
        appRouter
          .createCaller(context(null))
          .performance.status.get(startInput),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  describe("authorization", () => {
    it("refuses capture mutations without a capture role", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.startSession(startInput),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });

      expect(startCaptureSession).not.toHaveBeenCalled();
    });

    it("allows a data steward as well as a KPI owner", async () => {
      resolve.mockResolvedValue(authorization(["data_steward"]));

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.startSession(startInput),
      ).resolves.toMatchObject({ id: sessionId });
    });

    it("lets any authenticated user read measurements", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));

      await expect(
        appRouter
          .createCaller(context())
          .performance.measurement.list({ limit: 10 }),
      ).resolves.toHaveLength(1);
    });

    it("passes the data-steward capability to recall rather than trusting input", async () => {
      resolve.mockResolvedValue(
        authorization(["kpi_owner", "data_steward"]),
      );

      await appRouter
        .createCaller(context())
        .performance.capture.recall({ sessionId });

      expect(recallCaptureSession).toHaveBeenCalledWith({
        sessionId,
        actorId: userId,
        actorIsDataSteward: true,
      });

      recallCaptureSession.mockClear();
      resolve.mockResolvedValue(authorization(["kpi_owner"]));

      await appRouter
        .createCaller(context())
        .performance.capture.recall({ sessionId });

      expect(recallCaptureSession).toHaveBeenCalledWith({
        sessionId,
        actorId: userId,
        actorIsDataSteward: false,
      });
    });

    it("refuses commentary without an authoring role", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));

      await expect(
        appRouter
          .createCaller(context())
          .performance.commentary.add({ ...startInput, bodyEn: "note" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  describe("input validation", () => {
    it("rejects unknown keys on capture input", async () => {
      await expect(
        appRouter.createCaller(context()).performance.capture.startSession({
          ...startInput,
          ownerId: "someone-else",
        } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("takes the actor from the session, never from input", async () => {
      await appRouter
        .createCaller(context())
        .performance.capture.startSession(startInput);

      expect(startCaptureSession).toHaveBeenCalledWith({
        ...startInput,
        ownerId: userId,
      });

      await appRouter
        .createCaller(context())
        .performance.commentary.add({ ...startInput, bodyEn: "note" });

      expect(addCommentary).toHaveBeenCalledWith({
        ...startInput,
        bodyEn: "note",
        authorId: userId,
      });
    });

    it("rejects commentary with neither language", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.commentary.add(startInput as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(addCommentary).not.toHaveBeenCalled();
    });

    it("rejects an empty or oversized commentary body", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.commentary.add({ ...startInput, bodyEn: "   " }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        appRouter
          .createCaller(context())
          .performance.commentary.add({
            ...startInput,
            bodyAr: "ا".repeat(5001),
          }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("bounds the measurement list limit and defaults it", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.measurement.list({ limit: 5_000 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await appRouter
        .createCaller(context())
        .performance.measurement.list({});

      expect(listMeasurements).toHaveBeenCalledWith({ limit: 50 });
    });

    it("coerces asOf into a Date", async () => {
      const asOf = "2026-03-01T00:00:00.000Z";

      await appRouter
        .createCaller(context())
        .performance.measurement.list({ limit: 10, asOf } as never);

      expect(listMeasurements).toHaveBeenCalledWith({
        limit: 10,
        asOf: new Date(asOf),
      });
    });

    it("rejects a session id that is not a UUID", async () => {
      for (const badId of ["not-a-uuid", "", "12345"]) {
        await expect(
          appRouter
            .createCaller(context())
            .performance.capture.submit({ sessionId: badId, value: 90 }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });

        await expect(
          appRouter
            .createCaller(context())
            .performance.capture.recall({ sessionId: badId }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }

      expect(submitCaptureSession).not.toHaveBeenCalled();
      expect(recallCaptureSession).not.toHaveBeenCalled();
    });

    it("requires every coordinate on status and rollup reads", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.status.get({ kpiVersionId: "kpi" } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        appRouter
          .createCaller(context())
          .performance.rollup.get({ parentKpiId: "kpi" } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      // status.get must not accept a rollup's shape, or vice versa.
      await expect(
        appRouter.createCaller(context()).performance.status.get({
          parentKpiId: "kpi-parent",
          scopeNodeId: "scope-north",
          period: "2026-Q1",
        } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(getStatus).not.toHaveBeenCalled();
      expect(getRollup).not.toHaveBeenCalled();
    });

    it("rejects blank and oversized identifiers", async () => {
      await expect(
        appRouter.createCaller(context()).performance.status.get({
          ...startInput,
          kpiVersionId: "   ",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        appRouter.createCaller(context()).performance.status.get({
          ...startInput,
          scopeNodeId: "s".repeat(201),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        appRouter.createCaller(context()).performance.status.get({
          ...startInput,
          period: "p".repeat(51),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects an unknown filter on measurement.list", async () => {
      await expect(
        appRouter.createCaller(context()).performance.measurement.list({
          limit: 10,
          kpiId: "kpi-alpha",
        } as never),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(listMeasurements).not.toHaveBeenCalled();
    });

    it("passes every supported filter through to the service", async () => {
      const asOf = new Date("2026-03-01T00:00:00.000Z");

      await appRouter.createCaller(context()).performance.measurement.list({
        kpiVersionId: "kpi-version-alpha",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        asOf,
        limit: 25,
      });

      expect(listMeasurements).toHaveBeenCalledWith({
        kpiVersionId: "kpi-version-alpha",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        asOf,
        limit: 25,
      });
    });

    it("rejects an oversized evidence reference", async () => {
      await expect(
        appRouter.createCaller(context()).performance.capture.submit({
          sessionId,
          value: 90,
          evidenceRef: "e".repeat(1025),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects a non-finite measurement value", async () => {
      for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
        await expect(
          appRouter
            .createCaller(context())
            .performance.capture.submit({ sessionId, value }),
        ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      }

      expect(submitCaptureSession).not.toHaveBeenCalled();
    });

    it("rejects a non-numeric measurement value", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({
            sessionId,
            value: "90" as never,
          }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });
  });

  // -------------------------------------------------------------------------
  // Error mapping
  // -------------------------------------------------------------------------

  describe("error mapping", () => {
    it.each([
      ["INVALID_CAPTURE_TRANSITION", "CONFLICT"],
      ["DUPLICATE_ACTIVE_SESSION", "CONFLICT"],
      ["FEED_MEASUREMENT_LOCKED", "CONFLICT"],
      ["MEASUREMENT_LOCKED", "CONFLICT"],
      ["INVALID_SUPERSESSION", "CONFLICT"],
      ["RECALL_CUTOFF_REACHED", "CONFLICT"],
      ["CAPTURE_SESSION_NOT_FOUND", "NOT_FOUND"],
    ])("maps %s to %s", async (domainCode, transportCode) => {
      submitCaptureSession.mockRejectedValue(
        Object.assign(new Error("domain message"), { code: domainCode }),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({ sessionId, value: 90 }),
      ).rejects.toMatchObject({
        code: transportCode,
        message: "domain message",
      });
    });

    it.each([
      ["MEASUREMENT_NOT_FOUND", "NOT_FOUND"],
      ["KPI_BINDING_NOT_FOUND", "NOT_FOUND"],
      ["RULE_NOT_FOUND", "NOT_FOUND"],
      ["COMMENTARY_CONTENT_REQUIRED", "BAD_REQUEST"],
    ])("maps %s to %s on the commentary path", async (domainCode, transportCode) => {
      addCommentary.mockRejectedValue(
        Object.assign(new Error("domain message"), { code: domainCode }),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.commentary.add({ ...startInput, bodyEn: "note" }),
      ).rejects.toMatchObject({ code: transportCode });
    });

    it("does not leak a Prisma error shape as a domain code", async () => {
      // A Prisma error carries `code: "P2002"`, which must not be mistaken for
      // a mapped domain code and must not reach the caller.
      submitCaptureSession.mockRejectedValue(
        Object.assign(
          new Error(
            'Unique constraint failed on the fields: (`supersedes_id`)',
          ),
          { code: "P2002", meta: { target: ["supersedes_id"] } },
        ),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({ sessionId, value: 90 }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to complete performance operation",
      });
    });

    it("does not leak a raw PostgreSQL error", async () => {
      listMeasurements.mockRejectedValue(
        Object.assign(
          new Error(
            'permission denied for table measurements at character 8',
          ),
          { code: "42501", severity: "ERROR", table: "measurements" },
        ),
      );

      const caught = await appRouter
        .createCaller(context())
        .performance.measurement.list({ limit: 10 })
        .catch((error: unknown) => error);

      expect(caught).toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to complete performance operation",
      });
      expect(JSON.stringify(caught)).not.toContain("permission denied");
      expect(JSON.stringify(caught)).not.toContain("42501");
    });

    it("rejects a service response that violates the output contract", async () => {
      // If a service ever returned a malformed record, the client must get an
      // error rather than an unvalidated payload.
      getStatus.mockResolvedValue({
        id: "not-a-uuid",
        kpiVersionId: "kpi-version-alpha",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        status: "off_track",
        computedAt: new Date(),
        ruleVersionUsed: ruleVersionId,
      });

      await expect(
        appRouter.createCaller(context()).performance.status.get(startInput),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("rejects a measurement output with an unknown source", async () => {
      listMeasurements.mockResolvedValue([
        { ...measurement, source: "SATELLITE" },
      ]);

      await expect(
        appRouter
          .createCaller(context())
          .performance.measurement.list({ limit: 10 }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("maps an unauthorized recall to FORBIDDEN", async () => {
      recallCaptureSession.mockRejectedValue(
        Object.assign(new Error("not yours"), {
          code: "RECALL_NOT_PERMITTED",
        }),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.recall({ sessionId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("never leaks an unmapped failure", async () => {
      submitCaptureSession.mockRejectedValue(
        new Error(
          'insert into "performance"."measurements" violates constraint',
        ),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({ sessionId, value: 90 }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to complete performance operation",
      });
    });

    it("hides rule evaluation detail behind a generic message", async () => {
      listMeasurements.mockRejectedValue(
        Object.assign(new Error("band 3 blew up in evaluator.ts:88"), {
          code: "RULE_EVALUATION_FAILED",
        }),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.measurement.list({ limit: 10 }),
      ).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to complete performance operation",
      });
    });
  });

  // -------------------------------------------------------------------------
  // Service wiring, output and auditing
  // -------------------------------------------------------------------------

  describe("service wiring", () => {
    it("returns the submitted session and its measurement", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({ sessionId, value: 90 }),
      ).resolves.toMatchObject({
        session: { state: "SUBMITTED" },
        measurement: { id: measurementId, value: 90 },
      });
    });

    it("returns null when no status has been computed", async () => {
      await expect(
        appRouter.createCaller(context()).performance.status.get(startInput),
      ).resolves.toBeNull();

      await expect(
        appRouter.createCaller(context()).performance.rollup.get({
          parentKpiId: "kpi-parent",
          scopeNodeId: "scope-north",
          period: "2026-Q1",
        }),
      ).resolves.toBeNull();
    });

    it("returns a computed status through output validation", async () => {
      getStatus.mockResolvedValue({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kpiVersionId: "kpi-version-alpha",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        status: "off_track",
        computedAt: new Date(),
        ruleVersionUsed: ruleVersionId,
      });

      await expect(
        appRouter.createCaller(context()).performance.status.get(startInput),
      ).resolves.toMatchObject({
        status: "off_track",
        ruleVersionUsed: ruleVersionId,
      });
    });

    it("audits capture mutations and not reads", async () => {
      await appRouter
        .createCaller(context())
        .performance.capture.startSession(startInput);

      expect(recordCompletedCall).toHaveBeenCalledWith(
        expect.objectContaining({
          procedurePath: "performance.capture.startSession",
          procedureType: "mutation",
          actorUserId: userId,
        }),
      );

      recordCompletedCall.mockClear();

      await appRouter
        .createCaller(context())
        .performance.measurement.list({ limit: 10 });

      expect(recordCompletedCall).not.toHaveBeenCalled();
    });

    it("audits every capture and commentary mutation", async () => {
      const caller = appRouter.createCaller(context());

      await caller.performance.capture.submit({ sessionId, value: 90 });
      await caller.performance.capture.recall({ sessionId });
      await caller.performance.commentary.add({
        ...startInput,
        bodyEn: "note",
      });

      expect(
        recordCompletedCall.mock.calls.map(
          ([call]) => (call as { procedurePath: string }).procedurePath,
        ),
      ).toEqual([
        "performance.capture.submit",
        "performance.capture.recall",
        "performance.commentary.add",
      ]);
    });

    it("does not audit any read procedure", async () => {
      const caller = appRouter.createCaller(context());

      await caller.performance.measurement.list({ limit: 10 });
      await caller.performance.status.get(startInput);
      await caller.performance.rollup.get({
        parentKpiId: "kpi-parent",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
      });

      expect(recordCompletedCall).not.toHaveBeenCalled();
    });

    it("returns measurements through the output contract", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .performance.measurement.list({ limit: 10 }),
      ).resolves.toEqual([measurement]);
    });

    it("returns a computed rollup through output validation", async () => {
      getRollup.mockResolvedValue({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        parentKpiId: "kpi-parent",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        aggregatedValue: 80,
        method: "average",
        computedAt: new Date(),
        ruleVersionUsed: ruleVersionId,
      });

      await expect(
        appRouter.createCaller(context()).performance.rollup.get({
          parentKpiId: "kpi-parent",
          scopeNodeId: "scope-north",
          period: "2026-Q1",
        }),
      ).resolves.toMatchObject({
        aggregatedValue: 80,
        method: "average",
        ruleVersionUsed: ruleVersionId,
      });
    });

    it("accepts a rollup whose aggregated value is null", async () => {
      getRollup.mockResolvedValue({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        parentKpiId: "kpi-parent",
        scopeNodeId: "scope-north",
        period: "2026-Q1",
        aggregatedValue: null,
        method: "average",
        computedAt: new Date(),
        ruleVersionUsed: ruleVersionId,
      });

      await expect(
        appRouter.createCaller(context()).performance.rollup.get({
          parentKpiId: "kpi-parent",
          scopeNodeId: "scope-north",
          period: "2026-Q1",
        }),
      ).resolves.toMatchObject({ aggregatedValue: null });
    });

    it("does not audit a rejected mutation", async () => {
      submitCaptureSession.mockRejectedValue(
        Object.assign(new Error("nope"), {
          code: "INVALID_CAPTURE_TRANSITION",
        }),
      );

      await expect(
        appRouter
          .createCaller(context())
          .performance.capture.submit({ sessionId, value: 90 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });

      expect(recordCompletedCall).not.toHaveBeenCalled();
    });
  });
});
