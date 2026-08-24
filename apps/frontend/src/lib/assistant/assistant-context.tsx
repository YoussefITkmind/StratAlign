"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { resolveModule } from "@/lib/assistant/module-registry";
import type {
  AssistantChatMessage,
  AssistantContextValue,
  AssistantEntityRef,
  AssistantModuleContext,
  AssistantTimelineEntry,
} from "@/lib/assistant/types";

/** How many prior turns are sent as conversation history. Bounded to keep the
 * prompt small — see `packages/api/src/assistant.ts` for the hard server-side cap. */
const MAX_HISTORY_TURNS = 10;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The assistant could not answer that.";
}

/** What a page publishes about the entity/data it currently has on screen. */
interface PublishedContext {
  moduleId: string;
  entity: AssistantEntityRef | null;
  data: Record<string, AssistantContextValue> | null;
}

interface AssistantContextValueShape {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  timeline: AssistantTimelineEntry[];
  moduleContext: AssistantModuleContext;
  isSending: boolean;
  error: string | null;
  sendMessage: (text: string) => void;
  retry: () => void;
  publishContext: (
    moduleId: string,
    entity: AssistantEntityRef | null,
    data: Record<string, AssistantContextValue> | null,
  ) => void;
}

const AssistantContext = createContext<AssistantContextValueShape | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const activeModule = useMemo(() => resolveModule(pathname), [pathname]);

  const [isOpen, setIsOpen] = useState(false);
  const [timeline, setTimeline] = useState<AssistantTimelineEntry[]>([]);
  const [published, setPublished] = useState<PublishedContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = trpc.assistant.ask.useMutation();

  // Refs kept fresh every render so callbacks below don't need to be
  // rebuilt (and re-subscribed) on every keystroke or publish — the same
  // pattern used elsewhere in this codebase (see AiSuggestModal's
  // `runGenerateRef`) to read "current" values from a stable callback.
  const activeModuleRef = useRef(activeModule);
  const timelineRef = useRef(timeline);
  const publishedRef = useRef(published);
  useEffect(() => {
    activeModuleRef.current = activeModule;
    timelineRef.current = timeline;
    publishedRef.current = published;
  });

  // Announce a module switch in the timeline once the conversation has
  // actually started — silent before that, so opening the panel for the
  // first time never shows a wall of switch events for pages visited
  // before the user ever asked anything.
  const previousModuleIdRef = useRef(activeModule.id);
  useEffect(() => {
    if (previousModuleIdRef.current === activeModule.id) {
      return;
    }
    previousModuleIdRef.current = activeModule.id;

    if (timelineRef.current.length === 0) {
      return;
    }

    setTimeline((prev) => [
      ...prev,
      { kind: "context-switch", id: newId(), moduleName: activeModule.name, createdAt: Date.now() },
    ]);
  }, [activeModule]);

  // Published context only counts while it still belongs to the active
  // module — this is what makes a navigation safe without any explicit
  // "clear on route change" step: stale data from the previous page is
  // simply never shown once its moduleId stops matching.
  const moduleContext: AssistantModuleContext = useMemo(() => {
    const belongsToActiveModule = published?.moduleId === activeModule.id;
    return {
      module: activeModule.id,
      moduleName: activeModule.name,
      route: pathname,
      entity: belongsToActiveModule ? published!.entity : null,
      data: belongsToActiveModule ? published!.data : null,
      capabilities: activeModule.capabilities,
      helpContent: activeModule.helpContent,
      hasProvider: activeModule.hasProvider,
    };
  }, [activeModule, pathname, published]);

  const publishContext = useCallback(
    (
      moduleId: string,
      entity: AssistantEntityRef | null,
      data: Record<string, AssistantContextValue> | null,
    ) => {
      // A page publishing after the user has already navigated away (a slow
      // fetch resolving late) must not overwrite the new page's context.
      if (moduleId !== activeModuleRef.current.id) {
        return;
      }

      setPublished((prev) => {
        const next: PublishedContext = { moduleId, entity, data };
        if (
          prev &&
          prev.moduleId === next.moduleId &&
          JSON.stringify(prev.entity) === JSON.stringify(next.entity) &&
          JSON.stringify(prev.data) === JSON.stringify(next.data)
        ) {
          return prev;
        }
        return next;
      });
    },
    [],
  );

  const runAsk = useCallback(
    async (content: string, userMessageId: string) => {
      setError(null);

      const history = timelineRef.current
        .filter(
          (entry): entry is AssistantChatMessage =>
            entry.kind === "message" && entry.id !== userMessageId && !entry.failed,
        )
        .slice(-MAX_HISTORY_TURNS)
        .map((entry) => ({ role: entry.role, content: entry.content }));

      try {
        const result = await ask.mutateAsync({
          message: content,
          context: {
            module: moduleContext.module,
            moduleName: moduleContext.moduleName,
            route: moduleContext.route,
            entity: moduleContext.entity,
            data: moduleContext.data,
            capabilities: moduleContext.capabilities,
            helpContent: moduleContext.helpContent,
          },
          history,
        });

        setTimeline((prev) => [
          ...prev.map((entry) =>
            entry.kind === "message" && entry.id === userMessageId
              ? { ...entry, failed: false }
              : entry,
          ),
          {
            kind: "message",
            id: newId(),
            role: "assistant",
            content: result.answer,
            createdAt: Date.now(),
            grounded: result.grounded,
            insufficientContext: result.insufficientContext,
          },
        ]);
      } catch (cause) {
        setTimeline((prev) =>
          prev.map((entry) =>
            entry.kind === "message" && entry.id === userMessageId
              ? { ...entry, failed: true }
              : entry,
          ),
        );
        setError(errorMessage(cause));
      }
    },
    [ask, moduleContext],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || ask.isPending) {
        return;
      }

      const id = newId();
      setTimeline((prev) => [
        ...prev,
        { kind: "message", id, role: "user", content: trimmed, createdAt: Date.now() },
      ]);
      void runAsk(trimmed, id);
    },
    [ask.isPending, runAsk],
  );

  const retry = useCallback(() => {
    const lastFailed = [...timelineRef.current]
      .reverse()
      .find(
        (entry): entry is AssistantChatMessage =>
          entry.kind === "message" && entry.role === "user" && Boolean(entry.failed),
      );

    if (!lastFailed || ask.isPending) {
      return;
    }

    void runAsk(lastFailed.content, lastFailed.id);
  }, [ask.isPending, runAsk]);

  const value = useMemo<AssistantContextValueShape>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((prev) => !prev),
      timeline,
      moduleContext,
      isSending: ask.isPending,
      error,
      sendMessage,
      retry,
      publishContext,
    }),
    [isOpen, timeline, moduleContext, ask.isPending, error, sendMessage, retry, publishContext],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValueShape {
  const ctx = useContext(AssistantContext);
  if (!ctx) {
    throw new Error("useAssistant must be used within an AssistantProvider.");
  }
  return ctx;
}

/**
 * Lets a module page publish what it currently has on screen. Pass a
 * memoized `data`/`entity` (e.g. via `useMemo`) to avoid redundant publishes
 * — correctness does not depend on it (the provider de-dupes by value), but
 * a stable reference avoids re-running this effect on every render.
 */
export function usePublishAssistantContext(
  moduleId: string,
  entity: AssistantEntityRef | null,
  data: Record<string, AssistantContextValue> | null,
): void {
  const { publishContext } = useAssistant();

  useEffect(() => {
    publishContext(moduleId, entity, data);
  }, [publishContext, moduleId, entity, data]);
}
