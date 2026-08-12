import { appRouter } from "@spm/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RegistryApprovalError,
  RegistryOperationError,
} from "../../src/modules/registry/registry.errors";

/**
 * Contract tests for the registry tRPC surface.
 *
 * The integration suite proves the services behave; this proves the API in
 * front of them does — role gating, strict input validation, and the error
 * mapping that decides what a caller is told. Services are mocked so a failure
 * here is unambiguously a router problem.
 */

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const kpiDefinitionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const kpiVersionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ruleId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const okrId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const keyResultId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const childKpiId = "99999999-9999-4999-8999-999999999999";

const session = {
  user: { id: userId, email: "owner@example.test", name: "KPI Owner" },
  authenticatedAt: new Date(),
  sessionId: "11111111-1111-4111-8111-111111111111",
  expiresAt: new Date(Date.now() + 900_000),
  authenticationMethod: "credentials" as const,
};

const resolve = vi.fn();
const createDraft = vi.fn();
const publishVersion = vi.fn();
const retire = vi.fn();
const findSimilar = vi.fn();
const retirementImpact = vi.fn();
const listVersions = vi.fn();
const listKpis = vi.fn();
const getKpi = vi.fn();
const bindThresholdRule = vi.fn();
const getThresholdRuleBinding = vi.fn();
const createOkr = vi.fn();
const listOkrs = vi.fn();
const getOkr = vi.fn();
const updateProgress = vi.fn();
const setAlignments = vi.fn();
const setRollup = vi.fn();
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
    iam: { getStepUpPolicy: vi.fn() },
    rules: {},
    audit: {},
    registry: {
      kpi: {
        createDraft,
        publishVersion,
        retire,
        findSimilar,
        retirementImpact,
        listVersions,
        list: listKpis,
        getById: getKpi,
        bindThresholdRule,
        getThresholdRuleBinding,
      },
      okr: {
        create: createOkr,
        updateProgress,
        list: listOkrs,
        getById: getOkr,
      },
      alignment: { set: setAlignments },
      hierarchy: { setRollup },
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

const definitionOutput = {
  id: kpiDefinitionId,
  activeVersionId: kpiVersionId,
  status: "active" as const,
  retiredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const versionOutput = {
  id: kpiVersionId,
  kpiDefinitionId,
  version: 1,
  nameEn: "Customer Satisfaction Index",
  nameAr: "مؤشر رضا العملاء",
  descriptionEn: null,
  descriptionAr: null,
  unit: "%",
  polarity: "higher_is_better" as const,
  frequency: "monthly" as const,
  dataSourceType: "manual" as const,
  calculationLogicText: null,
  ownerUserId: userId,
  stewardUserId: null,
  activeFrom: new Date(),
  supersedesVersionId: null,
  approvalCaseId: "case-1",
  publishedAt: new Date(),
  createdAt: new Date(),
};

const kpiWithVersion = {
  definition: definitionOutput,
  version: versionOutput,
};

const validDraftInput = {
  nameEn: "Customer Satisfaction Index",
  nameAr: "مؤشر رضا العملاء",
  unit: "%",
  polarity: "higher_is_better" as const,
  frequency: "monthly" as const,
  dataSourceType: "manual" as const,
  ownerUserId: userId,
  activeFrom: new Date("2026-01-01T00:00:00.000Z"),
};

describe("registry tRPC surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolve.mockResolvedValue(authorization(["kpi_owner"]));
    recordCompletedCall.mockResolvedValue(undefined);
    createDraft.mockResolvedValue(kpiWithVersion);
    publishVersion.mockResolvedValue(kpiWithVersion);
    retire.mockResolvedValue({ ...definitionOutput, status: "retired" });
    findSimilar.mockResolvedValue([]);
    listVersions.mockResolvedValue([versionOutput]);
    listKpis.mockResolvedValue([kpiWithVersion]);
    getKpi.mockResolvedValue(kpiWithVersion);
    retirementImpact.mockResolvedValue({
      kpiDefinitionId,
      status: "active",
      affectedAlignments: [],
      affectedStrategyNodeIds: [],
      affectedHierarchyEdges: [],
      strategyNodesVerified: false,
    });
    createOkr.mockResolvedValue({
      id: okrId,
      objectiveNodeId: "node-1",
      nameEn: "Improve quality",
      nameAr: "تحسين الجودة",
      createdAt: new Date(),
      updatedAt: new Date(),
      keyResults: [],
    });
    listOkrs.mockResolvedValue([]);
    getOkr.mockResolvedValue(null);
    bindThresholdRule.mockResolvedValue({
      id: "77777777-7777-4777-8777-777777777777",
      kpiVersionId,
      thresholdRuleId: ruleId,
      ruleKey: "customer-satisfaction-threshold",
      ruleVersion: 1,
      createdAt: new Date(),
      createdBy: userId,
      supersedesBindingId: null,
    });
    getThresholdRuleBinding.mockResolvedValue(null);
    updateProgress.mockResolvedValue({
      id: keyResultId,
      okrId,
      type: "quantitative",
      targetValue: 100,
      unit: "%",
      currentValue: 25,
      progressPercent: 25,
      progressUpdatedAt: new Date(),
    });
    setAlignments.mockResolvedValue([]);
    setRollup.mockResolvedValue({
      id: "88888888-8888-4888-8888-888888888888",
      parentKpiId: kpiDefinitionId,
      childKpiId,
      rollupMethodRuleId: ruleId,
      createdAt: new Date(),
    });
  });

  describe("authentication", () => {
    it("refuses every registry procedure without a session", async () => {
      const caller = appRouter.createCaller(context(null));

      await expect(
        caller.registry.kpi.createDraft(validDraftInput),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      await expect(
        caller.registry.kpi.findSimilar({ text: "anything" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      await expect(caller.registry.kpi.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(
        caller.registry.kpi.get({ kpiDefinitionId }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(caller.registry.okr.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });

      await expect(
        caller.registry.okr.create({
          objectiveNodeId: "node-1",
          nameEn: "x",
          nameAr: "س",
          keyResults: [
            { type: "quantitative", targetValue: 1, unit: "%" },
          ],
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      expect(createDraft).not.toHaveBeenCalled();
      expect(findSimilar).not.toHaveBeenCalled();
      expect(createOkr).not.toHaveBeenCalled();
    });
  });

  describe("role gating", () => {
    it("lets any authoring role create a draft", async () => {
      for (const role of [
        "kpi_owner",
        "data_steward",
        "strategy_analyst",
        "seo_administrator",
      ]) {
        resolve.mockResolvedValueOnce(authorization([role]));

        await expect(
          appRouter
            .createCaller(context())
            .registry.kpi.createDraft(validDraftInput),
        ).resolves.toMatchObject({ definition: { id: kpiDefinitionId } });
      }

      expect(createDraft).toHaveBeenCalledTimes(4);
    });

    it("refuses a reader without an authoring role", async () => {
      resolve.mockResolvedValue(authorization(["executive_viewer"]));

      await expect(
        appRouter
          .createCaller(context())
          .registry.kpi.createDraft(validDraftInput),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Insufficient permissions",
      });

      expect(createDraft).not.toHaveBeenCalled();

      await expect(
        appRouter.createCaller(context()).registry.kpi.bindThresholdRule({
          kpiVersionId,
          thresholdRuleId: ruleId,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(bindThresholdRule).not.toHaveBeenCalled();
    });

    it("restricts publish and retire to lifecycle roles", async () => {
      // An authoring role is not enough to move the lifecycle.
      resolve.mockResolvedValue(authorization(["kpi_owner"]));
      const author = appRouter.createCaller(context());

      await expect(
        author.registry.kpi.publishVersion({
          kpiVersionId,
          approvalCaseId: "case-1",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(
        author.registry.kpi.retire({ kpiDefinitionId }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      expect(publishVersion).not.toHaveBeenCalled();
      expect(retire).not.toHaveBeenCalled();

      resolve.mockResolvedValue(authorization(["strategy_analyst"]));

      await expect(
        appRouter.createCaller(context()).registry.kpi.publishVersion({
          kpiVersionId,
          approvalCaseId: "case-1",
        }),
      ).resolves.toMatchObject({ version: { id: kpiVersionId } });
    });

    it("lets any authenticated user read without a role", async () => {
      resolve.mockResolvedValue(authorization([]));
      const caller = appRouter.createCaller(context());

      await expect(
        caller.registry.kpi.findSimilar({ text: "satisfaction" }),
      ).resolves.toEqual([]);

      await expect(
        caller.registry.kpi.retirementImpact({ kpiDefinitionId }),
      ).resolves.toMatchObject({ kpiDefinitionId });

      await expect(
        caller.registry.kpi.listVersions({ kpiDefinitionId }),
      ).resolves.toHaveLength(1);

      await expect(caller.registry.kpi.list()).resolves.toHaveLength(1);
      await expect(
        caller.registry.kpi.get({ kpiDefinitionId }),
      ).resolves.toEqual(kpiWithVersion);
      await expect(caller.registry.okr.list()).resolves.toEqual([]);
      await expect(caller.registry.okr.get({ okrId })).resolves.toBeNull();
      await expect(
        caller.registry.kpi.getThresholdRuleBinding({ kpiVersionId }),
      ).resolves.toBeNull();
    });

    it("allows an author to bind and stamps the authenticated actor", async () => {
      await appRouter.createCaller(context()).registry.kpi.bindThresholdRule({
        kpiVersionId,
        thresholdRuleId: ruleId,
      });

      expect(bindThresholdRule).toHaveBeenCalledWith({
        kpiVersionId,
        thresholdRuleId: ruleId,
        actorUserId: userId,
      });
    });
  });

  describe("approval gating", () => {
    it("maps an approval refusal to FORBIDDEN, not BAD_REQUEST", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));
      publishVersion.mockRejectedValue(
        new RegistryApprovalError("case-9 is not approved"),
      );

      await expect(
        appRouter.createCaller(context()).registry.kpi.publishVersion({
          kpiVersionId,
          approvalCaseId: "case-9",
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "Publication requires an approved workflow case",
      });
    });

    it("does not leak which case failed or why", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));
      publishVersion.mockRejectedValue(
        new RegistryApprovalError(
          "Approval case case-secret-42 does not govern kpi-xyz",
        ),
      );

      const failure = await appRouter
        .createCaller(context())
        .registry.kpi.publishVersion({
          kpiVersionId,
          approvalCaseId: "case-secret-42",
        })
        .catch((error: unknown) => error as { message: string });

      expect(failure.message).not.toContain("case-secret-42");
      expect(failure.message).not.toContain("kpi-xyz");
    });

    it("requires an approval case id in the input schema", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));
      const caller = appRouter.createCaller(context());

      await expect(
        // @ts-expect-error approvalCaseId is required by contract
        caller.registry.kpi.publishVersion({ kpiVersionId }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        caller.registry.kpi.publishVersion({
          kpiVersionId,
          approvalCaseId: "   ",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(publishVersion).not.toHaveBeenCalled();
    });

    it("passes the approval case through untouched when valid", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));

      await appRouter.createCaller(context()).registry.kpi.publishVersion({
        kpiVersionId,
        approvalCaseId: "case-1",
      });

      expect(publishVersion).toHaveBeenCalledWith({
        kpiVersionId,
        approvalCaseId: "case-1",
      });
    });
  });

  describe("input validation", () => {
    it("rejects unknown keys on every input schema", async () => {
      const caller = appRouter.createCaller(context());

      await expect(
        caller.registry.kpi.createDraft({
          ...validDraftInput,
          // @ts-expect-error schemas are strict
          smuggled: "value",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(createDraft).not.toHaveBeenCalled();
    });

    it("rejects a polarity or frequency outside the enum", async () => {
      const caller = appRouter.createCaller(context());

      await expect(
        caller.registry.kpi.createDraft({
          ...validDraftInput,
          // @ts-expect-error not a valid polarity
          polarity: "sideways",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        caller.registry.kpi.createDraft({
          ...validDraftInput,
          // @ts-expect-error weekly is not a supported frequency
          frequency: "weekly",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("bounds the similarity threshold to 0-1", async () => {
      const caller = appRouter.createCaller(context());

      await expect(
        caller.registry.kpi.findSimilar({ text: "x", threshold: 1.5 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        caller.registry.kpi.findSimilar({ text: "x", threshold: -0.1 }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        caller.registry.kpi.findSimilar({ text: "x", threshold: 0.4 }),
      ).resolves.toEqual([]);
    });

    it("rejects empty search text", async () => {
      await expect(
        appRouter
          .createCaller(context())
          .registry.kpi.findSimilar({ text: "   " }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(findSimilar).not.toHaveBeenCalled();
    });

    it("requires at least one key result on an OKR", async () => {
      await expect(
        appRouter.createCaller(context()).registry.okr.create({
          objectiveNodeId: "node-1",
          nameEn: "Improve quality",
          nameAr: "تحسين الجودة",
          keyResults: [],
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(createOkr).not.toHaveBeenCalled();
    });

    it("accepts an empty alignment list, which clears alignments", async () => {
      await expect(
        appRouter.createCaller(context()).registry.alignment.set({
          kpiDefinitionId,
          alignments: [],
        }),
      ).resolves.toEqual([]);

      expect(setAlignments).toHaveBeenCalledWith({
        kpiDefinitionId,
        alignments: [],
      });
    });

    it("accepts a non-uuid strategy node id, whose format another module owns", async () => {
      await expect(
        appRouter.createCaller(context()).registry.alignment.set({
          kpiDefinitionId,
          alignments: [
            { strategyNodeId: "node-obj-1", alignmentType: "objective" },
          ],
        }),
      ).resolves.toEqual([]);
    });

    it("requires uuids for ids this module does own", async () => {
      await expect(
        appRouter.createCaller(context()).registry.hierarchy.setRollup({
          parentKpiId: kpiDefinitionId,
          childKpiId,
          rollupMethodRuleId: "not-a-uuid",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      expect(setRollup).not.toHaveBeenCalled();
    });
  });

  describe("error mapping", () => {
    it("maps an ordinary registry failure to BAD_REQUEST", async () => {
      createDraft.mockRejectedValue(
        new RegistryOperationError("An open draft already exists"),
      );

      await expect(
        appRouter
          .createCaller(context())
          .registry.kpi.createDraft(validDraftInput),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Unable to create KPI draft",
      });
    });

    it("does not leak service detail on unexpected failures", async () => {
      setRollup.mockRejectedValue(
        new Error("connect ECONNREFUSED 10.0.0.5:5432"),
      );

      const failure = await appRouter
        .createCaller(context())
        .registry.hierarchy.setRollup({
          parentKpiId: kpiDefinitionId,
          childKpiId,
          rollupMethodRuleId: ruleId,
        })
        .catch((error: unknown) => error as { message: string });

      expect(failure.message).toBe("Unable to set rollup method");
      expect(failure.message).not.toContain("ECONNREFUSED");
    });

    it("gives each procedure its own failure message", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));
      retire.mockRejectedValue(new RegistryOperationError());
      updateProgress.mockRejectedValue(new RegistryOperationError());

      const caller = appRouter.createCaller(context());

      await expect(
        caller.registry.kpi.retire({ kpiDefinitionId }),
      ).rejects.toMatchObject({ message: "Unable to retire KPI" });

      await expect(
        caller.registry.keyResult.updateProgress({
          keyResultId,
          currentValue: 10,
        }),
      ).rejects.toMatchObject({
        message: "Unable to update key result progress",
      });
    });
  });

  describe("procedure wiring", () => {
    it("routes each of the nine required procedures to its service", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));
      const caller = appRouter.createCaller(context());

      await caller.registry.kpi.createDraft(validDraftInput);
      await caller.registry.kpi.publishVersion({
        kpiVersionId,
        approvalCaseId: "case-1",
      });
      await caller.registry.kpi.retire({ kpiDefinitionId });
      await caller.registry.kpi.findSimilar({ text: "satisfaction" });
      await caller.registry.kpi.retirementImpact({ kpiDefinitionId });
      await caller.registry.okr.create({
        objectiveNodeId: "node-1",
        nameEn: "Improve quality",
        nameAr: "تحسين الجودة",
        keyResults: [
          { type: "quantitative", targetValue: 95, unit: "%" },
        ],
      });
      await caller.registry.keyResult.updateProgress({
        keyResultId,
        currentValue: 25,
      });
      await caller.registry.alignment.set({
        kpiDefinitionId,
        alignments: [],
      });
      await caller.registry.hierarchy.setRollup({
        parentKpiId: kpiDefinitionId,
        childKpiId,
        rollupMethodRuleId: ruleId,
      });

      for (const service of [
        createDraft,
        publishVersion,
        retire,
        findSimilar,
        retirementImpact,
        createOkr,
        updateProgress,
        setAlignments,
        setRollup,
      ]) {
        expect(service).toHaveBeenCalledTimes(1);
      }
    });

    it("stamps the session user as the retire subject, not a client value", async () => {
      resolve.mockResolvedValue(authorization(["seo_administrator"]));

      await appRouter
        .createCaller(context())
        .registry.kpi.retire({ kpiDefinitionId });

      expect(retire).toHaveBeenCalledWith(kpiDefinitionId);
    });

    it("records mutations in the audit tap but not queries", async () => {
      const caller = appRouter.createCaller(context());

      await caller.registry.kpi.createDraft(validDraftInput);
      expect(recordCompletedCall).toHaveBeenCalledWith(
        expect.objectContaining({
          procedurePath: "registry.kpi.createDraft",
          procedureType: "mutation",
          actorUserId: userId,
        }),
      );

      recordCompletedCall.mockClear();

      await caller.registry.kpi.findSimilar({ text: "satisfaction" });
      expect(recordCompletedCall).not.toHaveBeenCalled();
    });

    it("does not audit a mutation that failed", async () => {
      createDraft.mockRejectedValue(new RegistryOperationError());

      await expect(
        appRouter
          .createCaller(context())
          .registry.kpi.createDraft(validDraftInput),
      ).rejects.toThrow();

      expect(recordCompletedCall).not.toHaveBeenCalled();
    });
  });

  describe("output contract", () => {
    it("rejects a malformed service response rather than passing it on", async () => {
      findSimilar.mockResolvedValue([
        {
          kpiDefinitionId,
          kpiVersionId,
          version: 1,
          status: "active",
          nameEn: "x",
          nameAr: "س",
          // Similarity must be 0-1; a value outside it means the search is
          // broken and the caller should not receive it as a score.
          similarity: 42,
          rank: 1,
          matchingFields: [],
        },
      ]);

      await expect(
        appRouter
          .createCaller(context())
          .registry.kpi.findSimilar({ text: "x" }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    });

    it("passes a well-formed similarity result through with rank order", async () => {
      findSimilar.mockResolvedValue([
        {
          kpiDefinitionId,
          kpiVersionId,
          version: 2,
          status: "active",
          nameEn: "Customer Satisfaction Index",
          nameAr: "مؤشر رضا العملاء",
          similarity: 0.82,
          rank: 1,
          matchingFields: [{ field: "nameEn", score: 0.82 }],
        },
      ]);

      const matches = await appRouter
        .createCaller(context())
        .registry.kpi.findSimilar({ text: "Customer Satisfaction Idx" });

      expect(matches).toHaveLength(1);
      expect(matches[0].rank).toBe(1);
      expect(matches[0].matchingFields[0].field).toBe("nameEn");
    });
  });
});
