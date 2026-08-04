"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  CREDENTIALS_PROVIDER_ID,
  ROUTES,
  SESSION_EXPIRED_ERROR_CODE,
  SSO_PROVIDER_ID,
} from "@/lib/auth/constants";
import { getAuthErrorMessage } from "@/lib/auth/error-messages";
import { useI18n } from "@/lib/i18n/locale-context";

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        d="M3 3l18 18M10.6 10.7a3 3 0 0 0 4.2 4.2M6.6 6.7C4.3 8.2 2.7 10.4 2 12c0 0 3.5 7 10 7 1.9 0 3.5-.5 4.9-1.3M17.5 17.4C19.4 15.9 21 13.5 22 12c0 0-1-2-2.9-3.9M9.9 4.2A11.9 11.9 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-2.4 3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SsoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" aria-hidden="true">
      <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        opacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

type FieldErrors = Partial<Record<"email" | "password", string>>;

type Translate = (path: string) => string;

function validate(t: Translate, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = t("login.emailRequired");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t("login.emailInvalid");
  if (!password) errors.password = t("login.passwordRequired");
  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const callbackUrl = searchParams.get("callbackUrl") || ROUTES.defaultAfterLogin;
  const urlErrorCode = searchParams.get("error");

  function localizedAuthError(code: string | null | undefined) {
    if (!code) return null;
    if (code === SESSION_EXPIRED_ERROR_CODE) return t("login.sessionExpired");
    if (code === "CredentialsSignin") return getAuthErrorMessage(code);
    return t("login.errorGeneric");
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    localizedAuthError(urlErrorCode)
  );
  const [ssoPending, startSsoTransition] = useTransition();
  const [credentialsPending, setCredentialsPending] = useState(false);

  const sessionExpired = urlErrorCode === SESSION_EXPIRED_ERROR_CODE;

  async function handleSsoSignIn() {
    setFormError(null);
    startSsoTransition(async () => {
      await signIn(SSO_PROVIDER_ID, { callbackUrl });
    });
  }

  async function handleCredentialsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(t, email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormError(null);
    setCredentialsPending(true);
    try {
      const result = await signIn(CREDENTIALS_PROVIDER_ID, {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (!result) {
        setFormError(localizedAuthError("Default"));
        return;
      }
      if (result.error) {
        setFormError(localizedAuthError(result.error));
        return;
      }
      router.push(result.url ?? callbackUrl);
      router.refresh();
    } catch {
      setFormError(localizedAuthError("Default"));
    } finally {
      setCredentialsPending(false);
    }
  }

  const anyPending = ssoPending || credentialsPending;

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[13px] font-medium">
        <span className="flex-1 rounded-full bg-white px-4 py-2 text-center shadow-sm">
          {t("login.tabSignIn")}
        </span>
        <a
          href={ROUTES.createAccount}
          className="flex-1 rounded-full px-4 py-2 text-center text-slate-500 transition hover:text-slate-700"
        >
          {t("login.tabCreateAccount")}
        </a>
      </div>

      <h1 className="text-[1.65rem] font-bold tracking-tight text-slate-900">
        {t("login.title")}
      </h1>
      <p className="mt-1 text-[14px] text-slate-500">{t("login.subtitle")}</p>

      {sessionExpired && (
        <div
          role="status"
          className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800"
        >
          {t("login.sessionExpired")}
        </div>
      )}
      {formError && !sessionExpired && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
        >
          {formError}
        </div>
      )}

      <button
        type="button"
        onClick={handleSsoSignIn}
        disabled={anyPending}
        className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-3 text-[14px] font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {ssoPending ? <Spinner /> : <SsoIcon />}
        {t("login.ssoButton")}
      </button>

      <div className="my-6 flex items-center gap-3 text-[12px] text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        {t("login.dividerText")}
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={handleCredentialsSubmit} noValidate className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("login.emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex.morgan@stratex.io"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
          {fieldErrors.email && (
            <p id="email-error" className="mt-1.5 text-[12.5px] text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="block text-[13px] font-medium text-slate-700">
              {t("login.passwordLabel")}
            </label>
          </div>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 pe-10 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          {fieldErrors.password && (
            <p id="password-error" className="mt-1.5 text-[12.5px] text-red-600">
              {fieldErrors.password}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between text-[13px]">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[var(--brand-accent,#4FB6C9)] focus:ring-[var(--brand-accent,#4FB6C9)]"
            />
            {t("login.rememberMe")}
          </label>
          <a
            href={ROUTES.forgotPassword}
            className="font-medium text-[var(--brand-accent,#2E8FA3)] hover:underline"
          >
            {t("login.forgotPassword")}
          </a>
        </div>

        <button
          type="submit"
          disabled={anyPending}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] py-3 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {credentialsPending ? (
            <Spinner />
          ) : (
            <>
              {t("login.submit")}
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true">
                <path
                  d="M5 12h14M13 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-slate-500">
        {t("login.noAccount")}{" "}
        <a
          href={ROUTES.createAccount}
          className="font-semibold text-[var(--brand-accent,#2E8FA3)] hover:underline"
        >
          {t("login.createAccountLink")}
        </a>
      </p>
    </div>
  );
}
