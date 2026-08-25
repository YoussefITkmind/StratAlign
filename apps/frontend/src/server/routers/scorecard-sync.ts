import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const scorecardStatus = z.enum(["on-track", "at-risk", "draft"]);
const objectiveStatus = z.enum(["on-track", "at-risk", "off-track", "not-started"]);
const mapLinkStrength = z.enum(["weak", "strong", "enables", "impacts", "drives", "supports"]);

const objectiveInput = z.object({
  scorecardId: id,
  perspectiveId: id,
  name: z.string().trim().min(1).max(300),
  status: objectiveStatus,
  progress: z.number().min(0).max(100),
  ownerName: z.string().trim().min(1).max(200),
  ownerInitials: z.string().trim().min(1).max(2).optional(),
  ownerColor: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(2000).nullable().optional(),
  kpiSnapshotIds: z.array(id).max(100).optional(),
}).strict();

const kpiInput = z.object({
  scorecardId: id,
  perspectiveId: id,
  name: z.string().trim().min(1).max(300),
  status: scorecardStatus,
  ownerInitials: z.string().trim().min(1).max(2),
  ownerColor: z.string().trim().min(1).max(100),
  score: z.number().min(0).max(100),
  priorScore: z.number().min(0).max(100).optional(),
  weight: z.number().min(0).max(100).optional(),
  actual: z.string().max(100).optional(),
  target: z.string().max(100).optional(),
  variance: z.string().max(100).optional(),
  trend: z.array(z.number().finite()).max(60).optional(),
  objectiveNodeIds: z.array(id).max(100).optional(),
}).strict();

const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    return translateBackendRegistryError(error);
  }
};

export const scorecardSyncRouter = router({
  objective: router({
    create: authenticatedProcedure
      .input(objectiveInput)
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.objective.create.mutate(input))),
    update: authenticatedProcedure
      .input(objectiveInput.extend({ objectiveNodeId: id }))
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.objective.update.mutate(input))),
    delete: authenticatedProcedure
      .input(z.object({ scorecardId: id, objectiveNodeId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.objective.delete.mutate(input))),
  }),
  kpi: router({
    create: authenticatedProcedure
      .input(kpiInput)
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.kpi.create.mutate(input))),
    update: authenticatedProcedure
      .input(kpiInput.extend({ kpiSnapshotId: id }))
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.kpi.update.mutate(input))),
    delete: authenticatedProcedure
      .input(z.object({ scorecardId: id, kpiSnapshotId: id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.kpi.delete.mutate(input))),
  }),
  map: router({
    link: router({
      create: authenticatedProcedure
        .input(z.object({
          scorecardId: id,
          fromObjectiveId: id,
          toObjectiveId: id,
          strength: mapLinkStrength,
        }).strict())
        .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.map.link.create.mutate(input))),
      delete: authenticatedProcedure
        .input(z.object({ scorecardId: id, linkId: id }).strict())
        .mutation(({ ctx, input }) => forward(() => backend(ctx).scorecardSync.map.link.delete.mutate(input))),
    }),
  }),
  health: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).scorecardSync.health.query())),
});
