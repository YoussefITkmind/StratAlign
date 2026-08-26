import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

export const initiativeStageSchema = z.enum(["design", "pilot", "execute", "scale", "done"]);
export const initiativeStatusSchema = z.enum(["on_track", "at_risk", "off_track"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const prioritySchema = z.enum(["critical", "high", "medium", "low"]);

const optionalUrl = z.string().trim().url().max(2048).nullable().optional();

export const initiativeRegisterInputSchema = z.object({
  nameEn: z.string().trim().min(1).max(300),
  nameAr: z.string().trim().min(1).max(300),
  strategicPlayNodeId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  stage: initiativeStageSchema,
  priority: prioritySchema.optional(),
  department: z.string().trim().max(200).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  budgetAmount: z.coerce.number().nonnegative().max(1_000_000_000_000).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
}).strict().refine(
  (input) => !input.startDate || !input.endDate || input.endDate >= input.startDate,
  { message: "End date cannot be before the start date", path: ["endDate"] },
);

export const projectCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable().optional(),
  department: z.string().trim().max(200).nullable().optional(),
  ownerUserId: z.string().uuid(),
  parentInitiativeId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  budgetAmount: z.coerce.number().nonnegative().max(1_000_000_000_000).nullable().optional(),
  priority: prioritySchema.optional(),
  jiraBoardUrl: optionalUrl,
  confluenceSpaceUrl: optionalUrl,
}).strict().refine(
  (input) => !input.startDate || !input.endDate || input.endDate >= input.startDate,
  { message: "End date cannot be before the start date", path: ["endDate"] },
);

export const projectListInputSchema = z.object({
  parentInitiativeId: z.string().uuid().optional(),
}).strict();

export const initiativeTransitionInputSchema = z.object({
  initiativeId: z.string().uuid(),
  toStage: initiativeStageSchema,
}).strict();

export const jiraLinkInputSchema = z.object({
  initiativeId: z.string().uuid(),
  jiraProjectKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  jiraProjectUrl: z.string().url().max(2048),
}).strict();

export const milestoneFlagInputSchema = z.object({
  jiraLinkId: z.string().uuid(),
  nameEn: z.string().trim().min(1).max(300),
  nameAr: z.string().trim().min(1).max(300),
  dueDate: z.coerce.date(),
  forecastDate: z.coerce.date().nullable().optional(),
  health: z.enum(["on_time", "at_risk", "late"]),
  source: z.enum(["manual", "jira"]),
}).strict();

export const statusUpdateInputSchema = z.object({
  initiativeId: z.string().uuid(),
  period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  stage: initiativeStageSchema,
  status: initiativeStatusSchema,
  confidence: confidenceSchema,
  narrativeEn: z.string().trim().max(4000).nullable().optional(),
  narrativeAr: z.string().trim().max(4000).nullable().optional(),
}).strict();

export interface ExecutionListItemView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  ownerDisplayName: string | null;
  stage: "design" | "pilot" | "execute" | "scale" | "done";
  latestStatus: "on_track" | "at_risk" | "off_track" | null;
  latestConfidence: "high" | "medium" | "low" | null;
  hasJiraLink: boolean;
  linkedProjectCount: number;
  updatedAt: Date;
}

export interface ProjectApiView {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  ownerUserId: string;
  parentInitiativeId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  budgetAmount: string | null;
  priority: "critical" | "high" | "medium" | "low";
  jiraBoardUrl: string | null;
  confluenceSpaceUrl: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionInitiativeDetailView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  stage: "design" | "pilot" | "execute" | "scale" | "done";
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; displayName: string | null };
  strategicPlay: { id: string; nameEn: string; nameAr: string; planVersionId: string };
  objectives: Array<{ id: string; nameEn: string; nameAr: string }>;
  jiraLink: null | {
    id: string;
    jiraProjectKey: string;
    jiraProjectUrl: string;
    lastSyncedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  milestones: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    dueDate: Date;
    forecastDate: Date | null;
    health: "on_time" | "at_risk" | "late";
    source: "manual" | "jira";
    createdAt: Date;
  }>;
  latestStatus: null | {
    id: string;
    period: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    status: "on_track" | "at_risk" | "off_track";
    confidence: "high" | "medium" | "low";
    narrativeEn: string | null;
    narrativeAr: string | null;
    submittedBy: string;
    createdAt: Date;
  };
}

export interface ExecutionServiceContract {
  list(input: {
    status?: "on_track" | "at_risk" | "off_track";
    scope: "all" | "mine" | "my_plays";
    actorUserId: string;
  }): Promise<ExecutionListItemView[]>;
  getInitiative(initiativeId: string): Promise<ExecutionInitiativeDetailView>;
  registerInitiative(input: {
    nameEn: string;
    nameAr: string;
    strategicPlayNodeId: string;
    ownerUserId: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    priority?: "critical" | "high" | "medium" | "low";
    department?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    tags?: string[];
    budgetAmount?: number | null;
    currency?: string;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  createProject(input: {
    name: string;
    description?: string | null;
    department?: string | null;
    ownerUserId: string;
    parentInitiativeId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    budgetAmount?: number | null;
    priority?: "critical" | "high" | "medium" | "low";
    jiraBoardUrl?: string | null;
    confluenceSpaceUrl?: string | null;
    actorUserId: string;
  }): Promise<ProjectApiView>;
  listProjects(input: { parentInitiativeId?: string }): Promise<ProjectApiView[]>;
  transitionStage(input: {
    initiativeId: string;
    toStage: "design" | "pilot" | "execute" | "scale" | "done";
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  linkJira(input: {
    initiativeId: string;
    jiraProjectKey: string;
    jiraProjectUrl: string;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  flagMilestone(input: {
    jiraLinkId: string;
    nameEn: string;
    nameAr: string;
    dueDate: Date;
    forecastDate?: Date | null;
    health: "on_time" | "at_risk" | "late";
    source: "manual" | "jira";
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  updateStatus(input: {
    initiativeId: string;
    period: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    status: "on_track" | "at_risk" | "off_track";
    confidence: "high" | "medium" | "low";
    narrativeEn?: string | null;
    narrativeAr?: string | null;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<unknown>;
  statusHistory(initiativeId: string): Promise<unknown[]>;
}

declare module "./index" {
  interface TrpcContext {
    execution?: ExecutionServiceContract;
  }
}

function service(ctx: { execution?: ExecutionServiceContract }): ExecutionServiceContract {
  if (!ctx.execution) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Execution service unavailable" });
  }
  return ctx.execution;
}

function mapExecutionError(error: unknown): never {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (
    code === "EXECUTION_PLAY_OWNERSHIP_REQUIRED" ||
    code === "EXECUTION_STAGE_OWNERSHIP_REQUIRED" ||
    code === "EXECUTION_INITIATIVE_OWNERSHIP_REQUIRED"
  ) {
    throw new TRPCError({ code: "FORBIDDEN", message: error instanceof Error ? error.message : "Execution ownership is required" });
  }
  if (
    code === "EXECUTION_INVALID_PLAY" ||
    code === "EXECUTION_INITIATIVE_NOT_FOUND" ||
    code === "EXECUTION_JIRA_LINK_NOT_FOUND" ||
    code === "EXECUTION_INVALID_STAGE_TRANSITION" ||
    code === "EXECUTION_INVALID_DATE_RANGE"
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid execution request" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "Unable to complete execution operation" });
}

export const executionRouter = router({
  initiative: router({
    list: protectedProcedure
      .input(z.object({
        status: initiativeStatusSchema.optional(),
        scope: z.enum(["all", "mine", "my_plays"]),
      }).strict())
      .query(async ({ ctx, input }) => {
        try {
          return await service(ctx).list({ ...input, actorUserId: ctx.session.user.id });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    get: protectedProcedure
      .input(z.object({ initiativeId: z.string().uuid() }).strict())
      .query(async ({ ctx, input }) => {
        try {
          return await service(ctx).getInitiative(input.initiativeId);
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    register: requireRole("objective_play_owner", "seo_administrator")
      .input(initiativeRegisterInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).registerInitiative({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    transitionStage: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(initiativeTransitionInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).transitionStage({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    linkJira: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(jiraLinkInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).linkJira({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) { return mapExecutionError(error); }
      }),
  }),
  project: router({
    list: protectedProcedure
      .input(projectListInputSchema)
      .query(async ({ ctx, input }) => {
        try {
          return await service(ctx).listProjects(input);
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    create: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(projectCreateInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).createProject({
            ...input,
            actorUserId: ctx.session.user.id,
          });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
  }),
  milestone: router({
    flag: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(milestoneFlagInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).flagMilestone({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) { return mapExecutionError(error); }
      }),
  }),
  status: router({
    update: requireRole("initiative_owner", "objective_play_owner", "seo_administrator")
      .input(statusUpdateInputSchema)
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).updateStatus({
            ...input,
            actorUserId: ctx.session.user.id,
            actorIsSeoAdministrator: ctx.authorizationState.roles.includes("seo_administrator"),
          });
        } catch (error) {
          return mapExecutionError(error);
        }
      }),
    history: protectedProcedure
      .input(z.object({ initiativeId: z.string().uuid() }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).statusHistory(input.initiativeId); } catch (error) { return mapExecutionError(error); }
      }),
  }),
});
