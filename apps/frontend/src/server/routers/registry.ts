import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const draftInput = z.object({
  kpiDefinitionId: id.optional(),
  nameEn: z.string().trim().min(1).max(300),
  nameAr: z.string().trim().min(1).max(300),
  descriptionEn: z.string().trim().max(4000).nullish(),
  descriptionAr: z.string().trim().max(4000).nullish(),
  unit: z.string().trim().min(1).max(50),
  polarity: z.enum(["higher_is_better", "lower_is_better"]),
  frequency: z.enum(["monthly", "quarterly"]),
  dataSourceType: z.enum(["manual", "feed"]),
  calculationLogicText: z.string().trim().max(4000).nullish(),
  ownerUserId: id,
  stewardUserId: id.nullish(),
  activeFrom: z.coerce.date(),
}).strict();

export const registryRouter = router({
  kpi: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).registry.kpi.list.query())),
    get: authenticatedProcedure.input(z.object({ kpiDefinitionId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).registry.kpi.get.query(input))),
    createDraft: authenticatedProcedure.input(draftInput)
      .mutation(({ ctx, input }) => forward(() => backend(ctx).registry.kpi.createDraft.mutate(input))),
    publishVersion: authenticatedProcedure.input(z.object({
      kpiVersionId: id, approvalCaseId: id,
    }).strict()).mutation(({ ctx, input }) =>
      forward(() => backend(ctx).registry.kpi.publishVersion.mutate(input))),
    retire: authenticatedProcedure.input(z.object({ kpiDefinitionId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).registry.kpi.retire.mutate(input))),
    listVersions: authenticatedProcedure.input(z.object({ kpiDefinitionId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).registry.kpi.listVersions.query(input))),
    retirementImpact: authenticatedProcedure.input(z.object({ kpiDefinitionId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).registry.kpi.retirementImpact.query(input))),
  }),
  okr: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).registry.okr.list.query())),
    get: authenticatedProcedure.input(z.object({ okrId: id }).strict())
      .query(({ ctx, input }) => forward(() => backend(ctx).registry.okr.get.query(input))),
    create: authenticatedProcedure.input(z.object({
      objectiveNodeId: z.string().trim().min(1).max(200),
      nameEn: z.string().trim().min(1).max(300),
      nameAr: z.string().trim().min(1).max(300),
      keyResults: z.array(z.object({
        type: z.enum(["quantitative", "milestone"]),
        targetValue: z.number().finite(),
        unit: z.string().trim().min(1).max(50),
      }).strict()).min(1).max(20),
    }).strict()).mutation(({ ctx, input }) =>
      forward(() => backend(ctx).registry.okr.create.mutate(input))),
  }),
  alignment: router({
    set: authenticatedProcedure.input(z.object({
      kpiDefinitionId: id,
      alignments: z.array(z.object({
        strategyNodeId: z.string().trim().min(1).max(200),
        alignmentType: z.enum(["objective", "play", "sector", "project"]),
      }).strict()).max(100),
    }).strict()).mutation(({ ctx, input }) =>
      forward(() => backend(ctx).registry.alignment.set.mutate(input))),
  }),
  strategyNodes: authenticatedProcedure.query(({ ctx }) =>
    forward(() => backend(ctx).strategy.node.list.query())),
});
