import { z } from "zod";
import { authenticatedProcedure, router } from "@/server/trpc";
import {
  createBackendRegistryClient,
  translateBackendRegistryError,
} from "@/server/backend-registry-client";

/**
 * Browser-facing proxy for the global, context-aware AI assistant.
 *
 * Same shape as `ai-suggestion.ts`: this layer authenticates, revalidates
 * input, and forwards. The model call and every AI decision happen in the
 * backend — nothing here holds an API key or interprets the conversation.
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

const backend = (ctx: { cookieHeader: string | null }) =>
  createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try { return await operation(); } catch (error) { return translateBackendRegistryError(error); }
};

const contextPrimitiveSchema = z.union([
  z.string().max(MAX_CONTEXT_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const contextRowSchema = z
  .record(z.string().max(100), contextPrimitiveSchema)
  .refine((row) => Object.keys(row).length <= MAX_CONTEXT_ROW_KEYS);

const contextValueSchema = z.union([
  contextPrimitiveSchema,
  z.array(contextPrimitiveSchema).max(MAX_CONTEXT_ARRAY_ITEMS),
  contextRowSchema,
  z.array(contextRowSchema).max(MAX_CONTEXT_ARRAY_ITEMS),
]);

const contextDataSchema = z
  .record(z.string().max(100), contextValueSchema)
  .nullable()
  .refine((data) => data === null || Object.keys(data).length <= MAX_CONTEXT_TOP_KEYS);

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

const askInput = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    context: assistantModuleContextSchema,
    history: z.array(assistantMessageSchema).max(MAX_HISTORY_MESSAGES),
  })
  .strict();

export const assistantRouter = router({
  ask: authenticatedProcedure.input(askInput).mutation(({ ctx, input }) =>
    forward(() => backend(ctx).assistant.ask.mutate(input))),
});
