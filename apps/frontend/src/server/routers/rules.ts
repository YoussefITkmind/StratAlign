import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const id = z.string().uuid();
const thresholdDocument = z.object({
  ruleType: z.literal("threshold_status"),
  direction: z.enum(["higher_is_better", "lower_is_better"]),
  bands: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    color: z.string().trim().min(1).max(50),
    comparator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
    value: z.number().finite(),
  }).strict()).min(1),
}).strict();

const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

export const rulesRouter = router({
  list: authenticatedProcedure.query(({ ctx }) => forward(() => backend(ctx).rules.list.query())),
  create: authenticatedProcedure.input(z.object({
    ruleKey: z.string().trim().min(1).max(150),
    name: z.string().trim().min(1).max(200),
    document: thresholdDocument,
  }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).rules.create.mutate(input))),
  preview: authenticatedProcedure.input(z.object({
    draftDocument: thresholdDocument,
    sampleData: z.object({ value: z.number().finite() }).strict(),
  }).strict()).mutation(({ ctx, input }) => forward(() => backend(ctx).rules.preview.mutate(input))),
  publish: authenticatedProcedure.input(z.object({ ruleId: id, approvalCaseId: id }).strict())
    .mutation(({ ctx, input }) => forward(() => backend(ctx).rules.publish.mutate(input))),
});
