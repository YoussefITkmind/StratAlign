"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Loader2, AlertTriangle, RotateCcw, Info } from "lucide-react";
import { useAssistant } from "@/lib/assistant/assistant-context";
import { useI18n } from "@/lib/i18n/locale-context";
import type { AssistantChatMessage } from "@/lib/assistant/types";

function replacePlaceholder(template: string, value: string): string {
  return template.replace("{module}", value);
}

function MessageBubble({ message }: { message: AssistantChatMessage }) {
  const { t } = useI18n();
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : message.failed
              ? "border border-red-200 bg-red-50 text-red-700"
              : "bg-slate-100 text-slate-800"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {!isUser && message.insufficientContext && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600">
            <Info className="h-3 w-3" /> {t("assistant.insufficientContextBadge")}
          </p>
        )}
      </div>
    </div>
  );
}

export function AssistantPanel() {
  const { isOpen, close, timeline, moduleContext, isSending, error, sendMessage, retry } =
    useAssistant();
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [timeline, isSending]);

  const contextLabel = useMemo(
    () => replacePlaceholder(t("assistant.contextLabel"), moduleContext.moduleName),
    [t, moduleContext.moduleName],
  );

  const handleSend = () => {
    if (!draft.trim() || isSending) return;
    sendMessage(draft);
    setDraft("");
  };

  return (
    <div
      role="dialog"
      aria-label={t("assistant.title")}
      aria-hidden={!isOpen}
      className={`fixed inset-y-0 right-0 z-40 flex h-dvh w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out rtl:right-auto rtl:left-0 rtl:border-l-0 rtl:border-r ${
        isOpen ? "translate-x-0" : "translate-x-full rtl:-translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-teal-500 to-blue-600 px-4 py-3.5 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t("assistant.title")}</p>
            <p className="truncate text-xs text-teal-50/90">{contextLabel}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={t("assistant.closeLabel")}
          onClick={close}
          className="shrink-0 rounded-lg p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div ref={scrollRef} className="app-scroll flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <MessageBubble
          message={{
            kind: "message",
            id: "welcome",
            role: "assistant",
            content: moduleContext.hasProvider
              ? t("assistant.welcomeMessage")
              : `${t("assistant.welcomeMessage")} ${t("assistant.notAvailableMessage")}`,
            createdAt: 0,
          }}
        />

        {timeline.map((entry) =>
          entry.kind === "context-switch" ? (
            <div key={entry.id} className="flex justify-center">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                {replacePlaceholder(t("assistant.contextSwitched"), entry.moduleName)}
              </span>
            </div>
          ) : (
            <MessageBubble key={entry.id} message={entry} />
          ),
        )}

        {isSending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("assistant.loading")}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-2 border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </span>
          <button
            type="button"
            onClick={retry}
            disabled={isSending}
            className="flex shrink-0 items-center gap-1 rounded-full border border-red-300 bg-white px-2.5 py-1 font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <RotateCcw className="h-3 w-3" /> {t("assistant.retry")}
          </button>
        </div>
      )}

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={t("assistant.inputPlaceholder")}
            aria-label={t("assistant.inputPlaceholder")}
            className="app-scroll max-h-28 min-h-[38px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || isSending}
            aria-label={t("assistant.send")}
            className="flex h-[38px] shrink-0 items-center justify-center rounded-xl bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("assistant.send")}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">{t("assistant.disclaimer")}</p>
      </div>
    </div>
  );
}
