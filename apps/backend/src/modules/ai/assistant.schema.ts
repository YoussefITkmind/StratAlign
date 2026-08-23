import { z } from "zod";

/**
 * Validates everything the assistant service receives before it touches a
 * prompt, and everything the model returns before it reaches a client.
 *
 * Mirrors `suggestion.schema.ts`'s role: untrusted input (frontend-supplied
 * context, conversation history) and untrusted output (model text) both cross
 * exactly one boundary, here, and nothing downstream re-checks either.
 */

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CONTENT_LENGTH = 2_000;
const MAX_CONTEXT_TOP_KEYS = 24;
const MAX_CONTEXT_ROW_KEYS = 20;
const MAX_CONTEXT_ARRAY_ITEMS = 40;
const MAX_CONTEXT_STRING_LENGTH = 500;
const MAX_CAPABILITIES = 10;
const MAX_ANSWER_LENGTH = 4_000;
const MAX_REFERENCED_ENTITIES = 20;

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

export const assistantModuleContextSchema = z
  .object({
    module: z.string().trim().min(1).max(100),
    moduleName: z.string().trim().min(1).max(150),
    route: z.string().trim().min(1).max(300),
    entity: entityRefSchema,
    data: contextDataSchema,
    capabilities: z.array(z.string().trim().min(1).max(60)).max(MAX_CAPABILITIES),
  })
  .strict();

export const assistantMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(MAX_HISTORY_CONTENT_LENGTH),
  })
  .strict();

export const askAssistantInputSchema = z
  .object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
    context: assistantModuleContextSchema,
    history: z.array(assistantMessageSchema).max(MAX_HISTORY_MESSAGES),
  })
  .strict();

export type AskAssistantValidatedInput = z.infer<typeof askAssistantInputSchema>;

/** The structured shape the model must answer in. Free text never passes through. */
export const assistantAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(MAX_ANSWER_LENGTH),
    confidence: z.number().min(0).max(1),
    grounded: z.boolean(),
    insufficientContext: z.boolean(),
    referencedEntities: z.array(z.string().trim().max(200)).max(MAX_REFERENCED_ENTITIES),
  })
  .strict();

export type ValidatedAssistantAnswer = z.infer<typeof assistantAnswerSchema>;
