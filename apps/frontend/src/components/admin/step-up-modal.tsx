"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/lib/i18n/locale-context";

/**
 * Opens when a sensitive admin mutation fails with the `stepUpRequired`
 * error data set by `requireStepUp` (server/trpc.ts) — i.e. the mock
 * equivalent of the real `withStepUpCheck` TRPCError contract from Prompt
 * 1.2. Re-verifies the current user's password via `iam.verifyStepUp` and,
 * on success, re-runs whatever mutation triggered the modal — no logout.
 */
export function StepUpModal({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const verify = trpc.iam.verifyStepUp.useMutation({
    onSuccess: () => {
      setPassword("");
      setError(null);
      onVerified();
    },
    onError: (err) => setError(err.message),
  });

  // Reset the form's local state whenever the modal transitions to open,
  // computed during render rather than in an effect (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPassword("");
      setError(null);
    }
  }

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="step-up-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="step-up-title" className="text-[16px] font-bold text-slate-900">
          {t("admin.stepUpTitle")}
        </h2>
        <p className="mt-1.5 text-[13px] text-slate-500">{t("admin.stepUpBody")}</p>

        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate({ password });
          }}
        >
          <div>
            <label htmlFor="step-up-password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
              {t("admin.stepUpPasswordLabel")}
            </label>
            <input
              ref={inputRef}
              id="step-up-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
            />
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] text-red-600">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={verify.isPending}
              data-testid="step-up-verify"
              className="rounded-lg bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
            >
              {verify.isPending ? t("admin.stepUpVerifying") : t("admin.stepUpVerify")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
