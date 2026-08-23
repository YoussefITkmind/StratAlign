/**
 * Frontend-side mirror of the assistant contract in
 * `packages/api/src/assistant.ts`. Kept as a separate, independently-typed
 * copy on purpose — the same convention every other domain in this repo
 * follows (see `ai-suggestion.ts` vs its frontend proxy): the wire boundary
 * is where the contract is enforced (by zod, on both sides), not shared
 * TypeScript types.
 */

export type AssistantContextPrimitive = string | number | boolean | null;
export type AssistantContextRow = Record<string, AssistantContextPrimitive>;
export type AssistantContextValue =
  | AssistantContextPrimitive
  | AssistantContextPrimitive[]
  | AssistantContextRow
  | AssistantContextRow[];

export interface AssistantEntityRef {
  type: string;
  id: string;
  name: string;
}

/**
 * What a module publishes about what the user is currently looking at.
 * `data`/`entity` are `null` until the owning page has real backend data to
 * publish — the panel must never show a stale or invented value in the
 * meantime.
 */
export interface AssistantModuleContext {
  module: string;
  moduleName: string;
  route: string;
  entity: AssistantEntityRef | null;
  data: Record<string, AssistantContextValue> | null;
  capabilities: string[];
  /** False for a module with no registered context provider (yet). */
  hasProvider: boolean;
}

export type AssistantMessageRole = "user" | "assistant";

export interface AssistantChatMessage {
  kind: "message";
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: number;
  /** Present on assistant messages that answered successfully. */
  grounded?: boolean;
  insufficientContext?: boolean;
  /** True on a user message the assistant failed to answer, to drive retry. */
  failed?: boolean;
}

export interface AssistantContextSwitchEvent {
  kind: "context-switch";
  id: string;
  moduleName: string;
  createdAt: number;
}

export type AssistantTimelineEntry = AssistantChatMessage | AssistantContextSwitchEvent;
