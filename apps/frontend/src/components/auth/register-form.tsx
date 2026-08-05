"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/auth/constants";
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

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirmPassword" | "terms", string>
>;

type Translate = (path: string) => string;

function validate(
  t: Translate,
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
  agreedToTerms: boolean
): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = t("register.nameRequired");
  if (!email.trim()) errors.email = t("register.emailRequired");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = t("register.emailInvalid");
  if (!password) errors.password = t("register.passwordRequired");
  else if (password.length < 8) errors.password = t("register.passwordTooShort");
  if (!confirmPassword) errors.confirmPassword = t("register.confirmRequired");
  else if (password && confirmPassword !== password)
    errors.confirmPassword = t("register.passwordMismatch");
  if (!agreedToTerms) errors.terms = t("register.termsRequired");
  return errors;
}

export function RegisterForm() {
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(t, name, email, password, confirmPassword, agreedToTerms);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setFormError(null);
    setPending(true);
    try {
      // TODO(Person A): wire up to the real registration endpoint once the
      // iam.local_credential-backed signup flow lands (see Prompt 1.1).
      router.push(ROUTES.login);
    } catch {
      setFormError(t("register.errorGeneric"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <div className="mb-8 flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[13px] font-medium">
        <a
          href={ROUTES.login}
          className="flex-1 rounded-full px-4 py-2 text-center text-slate-500 transition hover:text-slate-700"
        >
          {t("register.tabSignIn")}
        </a>
        <span className="flex-1 rounded-full bg-white px-4 py-2 text-center shadow-sm">
          {t("register.tabCreateAccount")}
        </span>
      </div>

      <h1 className="text-[1.65rem] font-bold tracking-tight text-slate-900">
        {t("register.title")}
      </h1>
      <p className="mt-1 text-[14px] text-slate-500">{t("register.subtitle")}</p>

      {formError && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700"
        >
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("register.nameLabel")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Morgan"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
          {fieldErrors.name && (
            <p id="name-error" className="mt-1.5 text-[12.5px] text-red-600">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("register.emailLabel")}
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
          <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("register.passwordLabel")}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
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

        <div>
          <label htmlFor="confirmPassword" className="mb-1.5 block text-[13px] font-medium text-slate-700">
            {t("register.confirmPasswordLabel")}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[var(--brand-accent,#4FB6C9)] focus:ring-2 focus:ring-[var(--brand-accent,#4FB6C9)]/25"
          />
          {fieldErrors.confirmPassword && (
            <p id="confirm-password-error" className="mt-1.5 text-[12.5px] text-red-600">
              {fieldErrors.confirmPassword}
            </p>
          )}
        </div>

        <div>
          <label className="flex items-start gap-2 text-[13px] text-slate-600">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              aria-invalid={Boolean(fieldErrors.terms)}
              aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[var(--brand-accent,#4FB6C9)] focus:ring-[var(--brand-accent,#4FB6C9)]"
            />
            <span>
              {t("register.termsPrefix")}{" "}
              <Link href="/terms" className="font-medium text-[var(--brand-accent,#2E8FA3)] hover:underline">
                {t("register.termsOfService")}
              </Link>{" "}
              {t("register.and")}{" "}
              <Link href="/privacy" className="font-medium text-[var(--brand-accent,#2E8FA3)] hover:underline">
                {t("register.privacyPolicy")}
              </Link>
            </span>
          </label>
          {fieldErrors.terms && (
            <p id="terms-error" className="mt-1.5 text-[12.5px] text-red-600">
              {fieldErrors.terms}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0E2338] to-[#2E8FA3] py-3 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Spinner />
          ) : (
            <>
              {t("register.submit")}
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
        {t("register.haveAccount")}{" "}
        <a
          href={ROUTES.login}
          className="font-semibold text-[var(--brand-accent,#2E8FA3)] hover:underline"
        >
          {t("register.signInLink")}
        </a>
      </p>
    </div>
  );
}
