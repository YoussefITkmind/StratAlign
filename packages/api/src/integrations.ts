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

export type InvestigationConfidenceValue = "low" | "medium" | "high";
export type InvestigationKindValue = "SYNC_FAILURE" | "VOLUME_DROP" | "NO_ANOMALY";
export type InvestigationSourceValue = "ai" | "deterministic";
export type InvestigationInsufficientReasonValue = "NO_ERROR_DETAIL" | "NO_HISTORICAL_VOLUME" | "TOO_FEW_OBSERVATIONS";

export interface SyncInvestigationOutput {
  syncLogId: string;
  integration: string;
  kind: InvestigationKindValue;
  source: InvestigationSourceValue;
  diagnosis: string;
  likelyCause: string | null;
  confidence: InvestigationConfidenceValue;
  evidence: string[];
  recommendedActions: string[];
  insufficientData: boolean;
  insufficientReasons: InvestigationInsufficientReasonValue[];
  volume: {
    currentVolume: number;
    historicalAverage: number;
    changePercent: number;
    sampleCount: number;
    isAnomalousDrop: boolean;
  } | null;
  evidenceLogCount: number;
  generatedAt: string;
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

export interface SyncInvestigationServiceContract {
  investigate(syncLogId: string): Promise<SyncInvestigationOutput>;
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
  syncInvestigation: SyncInvestigationServiceContract;
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

function failInvestigation(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
  switch (code) {
    case "INTEGRATIONS_SYNC_LOG_NOT_FOUND":
      throw new TRPCError({ code: "NOT_FOUND", message: "Sync log entry was not found" });
    case "AI_UNAVAILABLE":
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "AI investigation is unavailable right now. Try again later." });
    case "AI_TIMEOUT":
      throw new TRPCError({ code: "TIMEOUT", message: "The AI investigation took too long to respond. Try again." });
    case "AI_MALFORMED_OUTPUT":
      throw new TRPCError({ code: "UNPROCESSABLE_CONTENT", message: "The AI investigation result could not be used. Try again." });
    default:
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unable to investigate this sync run" });
  }
}

const manage = () => requireRole("platform_administrator", "data_steward");
const id = z.string().uuid();

const syncInvestigationOutputSchema = z.object({
  syncLogId: z.string(),
  integration: z.string(),
  kind: z.enum(["SYNC_FAILURE", "VOLUME_DROP", "NO_ANOMALY"]),
  source: z.enum(["ai", "deterministic"]),
  diagnosis: z.string().min(1),
  likelyCause: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
  evidence: z.array(z.string()).max(6),
  recommendedActions: z.array(z.string()).max(5),
  insufficientData: z.boolean(),
  insufficientReasons: z.array(z.enum(["NO_ERROR_DETAIL", "NO_HISTORICAL_VOLUME", "TOO_FEW_OBSERVATIONS"])),
  volume: z.object({
    currentVolume: z.number(),
    historicalAverage: z.number(),
    changePercent: z.number(),
    sampleCount: z.number().int(),
    isAnomalousDrop: z.boolean(),
  }).strict().nullable(),
  evidenceLogCount: z.number().int(),
  generatedAt: z.string(),
}).strict();

export const integrationsRouter = router({
  connections: router({
    list: manage().query(async ({ ctx }) => {
      try { return await service(ctx).connections.list(); } catch (error) { return fail(error); }
    }),
    toggle: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).connections.toggle(input.id); } catch (error) { return fail(error); }
    }),
    syncNow: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).connections.syncNow(input.id); } catch (error) { return fail(error); }
    }),
  }),
  syncLogs: router({
    list: manage().query(async ({ ctx }) => {
      try { return await service(ctx).syncLogs.list(); } catch (error) { return fail(error); }
    }),
    investigate: manage()
      .input(z.object({ syncLogId: id }).strict())
      .output(syncInvestigationOutputSchema)
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).syncInvestigation.investigate(input.syncLogId); } catch (error) { return failInvestigation(error); }
      }),
  }),
  apiKeys: router({
    list: manage().query(async ({ ctx }) => {
      try { return await service(ctx).apiKeys.list(); } catch (error) { return fail(error); }
    }),
    create: manage().input(z.object({ name: z.string().trim().min(1).max(200), scope: z.enum(["READ", "WRITE", "ADMIN"]) }).strict()).mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).apiKeys.create({ name: input.name, scope: input.scope, ownerId: ctx.session.user.id, ownerName: ctx.session.user.name ?? ctx.session.user.email ?? "Unknown" });
      } catch (error) { return fail(error); }
    }),
    toggleDisabled: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).apiKeys.toggleDisabled(input.id); } catch (error) { return fail(error); }
    }),
    revoke: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).apiKeys.revoke(input.id); } catch (error) { return fail(error); }
    }),
  }),
  webhooks: router({
    list: manage().query(async ({ ctx }) => {
      try { return await service(ctx).webhooks.list(); } catch (error) { return fail(error); }
    }),
    create: manage().input(z.object({ name: z.string().trim().min(1).max(200), url: z.string().trim().url().max(2000), events: z.array(z.string().trim().min(1).max(100)).max(20) }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).webhooks.create(input); } catch (error) { return fail(error); }
    }),
    toggleActive: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).webhooks.toggleActive(input.id); } catch (error) { return fail(error); }
    }),
    delete: manage().input(z.object({ id }).strict()).mutation(async ({ ctx, input }) => {
      try { return await service(ctx).webhooks.delete(input.id); } catch (error) { return fail(error); }
    }),
  }),
});
