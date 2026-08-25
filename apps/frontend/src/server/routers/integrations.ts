import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendIntegrationsClient,
  translateBackendIntegrationsError,
} from "@/server/backend-integrations-client";

const id = z.string().uuid();
const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendIntegrationsClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendIntegrationsError(error); }
};

export const integrationsRouter = router({
  connections: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).integrations.connections.list.query())),
    toggle: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.connections.toggle.mutate(input))),
    syncNow: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.connections.syncNow.mutate(input))),
  }),
  syncLogs: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).integrations.syncLogs.list.query())),
    // Forwards an identifier only. Evidence collection, the model call, and
    // every guardrail live in the backend; this layer holds no AI credential
    // and makes no diagnostic decision.
    investigate: authenticatedProcedure.input(z.object({ syncLogId: id }).strict())
      .mutation(({ ctx, input }) =>
        forward(() => backend(ctx).integrations.syncLogs.investigate.mutate(input))),
  }),
  apiKeys: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).integrations.apiKeys.list.query())),
    create: authenticatedProcedure.input(z.object({
      name: z.string().trim().min(1).max(200),
      scope: z.enum(["READ", "WRITE", "ADMIN"]),
    }).strict()).mutation(({ ctx, input }) =>
      forward(() => backend(ctx).integrations.apiKeys.create.mutate(input))),
    toggleDisabled: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.apiKeys.toggleDisabled.mutate(input))),
    revoke: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.apiKeys.revoke.mutate(input))),
  }),
  webhooks: router({
    list: authenticatedProcedure.query(({ ctx }) =>
      forward(() => backend(ctx).integrations.webhooks.list.query())),
    create: authenticatedProcedure.input(z.object({
      name: z.string().trim().min(1).max(200),
      url: z.string().trim().url().max(2000),
      events: z.array(z.string().trim().min(1).max(100)).max(20),
    }).strict()).mutation(({ ctx, input }) =>
      forward(() => backend(ctx).integrations.webhooks.create.mutate(input))),
    toggleActive: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.webhooks.toggleActive.mutate(input))),
    delete: authenticatedProcedure.input(z.object({ id }).strict())
      .mutation(({ ctx, input }) => forward(() => backend(ctx).integrations.webhooks.delete.mutate(input))),
  }),
});
