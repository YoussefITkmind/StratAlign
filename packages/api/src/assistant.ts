import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * Global, context-aware AI assistant surface.
 *
 * Follows the same shape as `ai-suggestion.ts`: the service contract lives
 * here, the backend supplies an implementation through context, and the
 * router owns authorisation, strict input validation, output validation, and
 * mapping domain errors to codes a client may see.
 *
 * Deliberately module-agnostic — `context.module`/`context.data` are opaque
 * to this file. Any authenticated user may ask a question; this is a
 * read-only, explanatory surface with no mutation capability, so there is no
 * role gate beyond being signed in.
 */

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CONTENT_LENGTH = 2_000;
const MAX_CONTEXT_TOP_KEYS = 24;
const MAX_CONTEXT_ROW_KEYS = 20;
const MAX_CONTEXT_ARRAY_ITEMS = 40;
const MAX_CONTEXT_STRING_LENGTH = 500;
const MAX_CAPABILITIES = 10;
const MAX_HELP_ITEMS = 20;
const MAX_HELP_ITEM_LENGTH = 300;

const contextPrimitiveSchema = z.union([
  z.string().max(MAX_CONTEXT_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const contextRowSchema = z
  .record(z.string().max(100), contextPrimitiveSchema)
  .refine((row) => Object.keys(row).length <= MAX_CONTEXT_ROW_KEYS, {
    message: `A context row may not exceed ${MAX_CONTEXT_ROW_KEYS} fields`,
  });

const contextValueSchema = z.union([
  contextPrimitiveSchema,
  z.array(contextPrimitiveSchema).max(MAX_CONTEXT_ARRAY_ITEMS),
  contextRowSchema,
  z.array(contextRowSchema).max(MAX_CONTEXT_ARRAY_ITEMS),
]);

const contextDataSchema = z
  .record(z.string().max(100), contextValueSchema)
  .nullable()
  .refine(
    (data) => data === null || Object.keys(data).length <= MAX_CONTEXT_TOP_KEYS,
    { message: `Context data may not exceed ${MAX_CONTEXT_TOP_KEYS} top-level fields` },
  );

const entityRefSchema = z
  .object({
    type: z.string().trim().min(1).max(100),
    id: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(300),
  })
  .strict()
  .nullable();

const assistantModuleContextSchema = z
  .object({
    module: z.string().trim().min(1).max(100),
    moduleName: z.string().trim().min(1).max(150),
    route: z.string().trim().min(1).max(300),
    entity: entityRefSchema,
    data: contextDataSchema,
    capabilities: z.array(z.string().trim().min(1).max(60)).max(MAX_CAPABILITIES),
    helpContent: z.array(z.string().trim().min(1).max(MAX_HELP_ITEM_LENGTH)).max(MAX_HELP_ITEMS),
  })
  .strict();

const assistantMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_HISTORY_CONTENT_LENGTH),
  })
  .strict();

const askAssistantInputSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    context: assistantModuleContextSchema,
    history: z.array(assistantMessageSchema).max(MAX_HISTORY_MESSAGES),
  })
  .strict();

export type AssistantModuleContextInput = z.infer<typeof assistantModuleContextSchema>;
export type AssistantMessageInput = z.infer<typeof assistantMessageSchema>;
export type AskAssistantApiInput = z.infer<typeof askAssistantInputSchema>;

const assistantAnswerOutputSchema = z
  .object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
    grounded: z.boolean(),
    insufficientContext: z.boolean(),
    referencedEntities: z.array(z.string()),
  })
  .strict();

export type AssistantAnswerOutput = z.infer<typeof assistantAnswerOutputSchema>;

export interface AssistantServiceContract {
  ask(input: AskAssistantApiInput): Promise<AssistantAnswerOutput>;
}

declare module "./index" {
  interface TrpcContext {
    assistant?: AssistantServiceContract;
  }
}

function service(ctx: {
  assistant?: AssistantServiceContract;
}): AssistantServiceContract {
  if (!ctx.assistant) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Assistant service unavailable",
    });
  }
  return ctx.assistant;
}

/**
 * Maps a service failure to something a client may see. Every branch returns
 * a fixed message — an upstream provider error can carry account identifiers
 * or echoed prompt text, so none of that is ever forwarded.
 */
function toAssistantError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "AI_UNAVAILABLE":
      return new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "The AI assistant is unavailable right now. Try again later.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "The AI assistant took too long to respond. Try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "The AI assistant's response could not be used. Try asking again.",
      });
    default:
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to reach the AI assistant",
      });
  }
}

export const assistantRouter = router({
  /**
   * A mutation, not a query: it spends money, is not cacheable, and must
   * never be replayed by a client-side refetch.
   */
  ask: protectedProcedure
    .input(askAssistantInputSchema)
    .output(assistantAnswerOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).ask(input);
      } catch (error) {
        throw toAssistantError(error);
      }
    }),
});
