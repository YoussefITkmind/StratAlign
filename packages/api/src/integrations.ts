import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { requireRole, router } from "./index";

export type ConnectionStatusValue = "CONNECTED" | "ERROR" | "DISCONNECTED" | "PENDING";
export type SyncLogStatusValue = "SUCCESS" | "FAILED" | "PARTIAL" | "RUNNING";
export type ApiKeyScopeValue = "READ" | "WRITE" | "ADMIN";

export interface ConnectionOutput {
  id: string;
  name: string;
  category: string;
  status: ConnectionStatusValue;
  direction: string;
  lastSync: string;
  recordsIn: number;
  recordsOut: number;
  meta: string;
  color: string;
  icon: string;
}

export interface SyncLogOutput {
  id: string;
  integration: string;
  started: string;
  duration: string;
  status: SyncLogStatusValue;
  recordsIn: number | null;
  recordsOut: number | null;
  errors: number;
  message: string;
  color: string;
  icon: string;
}

export interface ApiKeyOutput {
  id: string;
  name: string;
  scope: ApiKeyScopeValue;
  keyPreview: string;
  owner: string;
  created: string;
  expires: string;
  lastUsed: string;
  requests: number;
  disabled: boolean;
}

export interface CreatedApiKeyOutput extends ApiKeyOutput {
  secret: string;
}

export interface WebhookOutput {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  successRate: number;
}

export interface ConnectionsServiceContract {
  list(): Promise<ConnectionOutput[]>;
  toggle(id: string): Promise<ConnectionOutput>;
  syncNow(id: string): Promise<ConnectionOutput>;
}

export interface SyncLogsServiceContract {
  list(): Promise<SyncLogOutput[]>;
}

export interface ApiKeysServiceContract {
  list(): Promise<ApiKeyOutput[]>;
  create(input: { name: string; scope: ApiKeyScopeValue; ownerId: string; ownerName: string }): Promise<CreatedApiKeyOutput>;
  toggleDisabled(id: string): Promise<ApiKeyOutput>;
  revoke(id: string): Promise<{ id: string }>;
}

export interface WebhooksServiceContract {
  list(): Promise<WebhookOutput[]>;
  create(input: { name: string; url: string; events: string[] }): Promise<WebhookOutput>;
  toggleActive(id: string): Promise<WebhookOutput>;
  delete(id: string): Promise<{ id: string }>;
}

export interface IntegrationsServicesContract {
  connections: ConnectionsServiceContract;
  syncLogs: SyncLogsServiceContract;
  apiKeys: ApiKeysServiceContract;
  webhooks: WebhooksServiceContract;
}

declare module "./index" {
  interface TrpcContext {
    integrations?: IntegrationsServicesContract;
  }
}

const service = (ctx: { integrations?: IntegrationsServicesContract }): IntegrationsServicesContract => {
  if (!ctx.integrations) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Integrations service unavailable" });
  }
  return ctx.integrations;
};

const fail = (error: unknown): never => {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Integrations operation failed",
  });
};

const manage = () => requireRole("platform_administrator", "data_steward");

const id = z.string().uuid();

export const integrationsRouter = router({
  connections: router({
    list: manage().query(async ({ ctx }) => {
      try {
        return await service(ctx).connections.list();
      } catch (error) {
        return fail(error);
      }
    }),
    toggle: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).connections.toggle(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
    syncNow: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).connections.syncNow(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
  }),
  syncLogs: router({
    list: manage().query(async ({ ctx }) => {
      try {
        return await service(ctx).syncLogs.list();
      } catch (error) {
        return fail(error);
      }
    }),
  }),
  apiKeys: router({
    list: manage().query(async ({ ctx }) => {
      try {
        return await service(ctx).apiKeys.list();
      } catch (error) {
        return fail(error);
      }
    }),
    create: manage()
      .input(
        z.object({
          name: z.string().trim().min(1).max(200),
          scope: z.enum(["READ", "WRITE", "ADMIN"]),
        }).strict(),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).apiKeys.create({
            name: input.name,
            scope: input.scope,
            ownerId: ctx.session.user.id,
            ownerName: ctx.session.user.name ?? ctx.session.user.email ?? "Unknown",
          });
        } catch (error) {
          return fail(error);
        }
      }),
    toggleDisabled: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).apiKeys.toggleDisabled(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
    revoke: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).apiKeys.revoke(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
  }),
  webhooks: router({
    list: manage().query(async ({ ctx }) => {
      try {
        return await service(ctx).webhooks.list();
      } catch (error) {
        return fail(error);
      }
    }),
    create: manage()
      .input(
        z.object({
          name: z.string().trim().min(1).max(200),
          url: z.string().trim().url().max(2000),
          events: z.array(z.string().trim().min(1).max(100)).max(20),
        }).strict(),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).webhooks.create(input);
        } catch (error) {
          return fail(error);
        }
      }),
    toggleActive: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).webhooks.toggleActive(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
    delete: manage()
      .input(z.object({ id }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).webhooks.delete(input.id);
        } catch (error) {
          return fail(error);
        }
      }),
  }),
});
