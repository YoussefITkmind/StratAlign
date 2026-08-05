# StratAlign — Login + Logout UI (Track D / STRAAL-33)

Matches the provided UI/UX reference (split-panel, dark brand side + white
credentials side).

## Run it

From the repo root:

```bash
pnpm install
cp apps/frontend/.env.example apps/frontend/.env.local
cd apps/frontend && npx auth secret   # writes a real AUTH_SECRET into .env.local
pnpm dev
```

Open http://localhost:3000/login.

Sign in with the **temporary demo credentials** (see the big warning in
`src/lib/auth/auth.ts`):

```
email:    demo@stratalign.dev
password: password123
```

The "Continue with SSO" button is wired to a placeholder OIDC provider
pointed at a local mock IdP (`src/app/api/mock-idp/*`) that implements a
real authorization-code + PKCE exchange.

⚠️ **`src/lib/auth/auth.ts` is a throwaway stub**, not the real Prompt 1.1
auth config. It exists only so the page is clickable locally. A teammate's
`feature/1.1-authentication` branch has the real Auth.js config (argon2-backed
credentials provider against the real backend, real generic OIDC config,
rate limiting) — this branch was intentionally kept independent of that work
per project decision; reconcile the two `auth.ts` implementations when both
land on `main`.

## Files

```
apps/frontend/src/
├── app/(auth)/layout.tsx          full-height shell, no app chrome
├── app/(auth)/login/page.tsx      the login route
├── app/(auth)/register/page.tsx   the create-account route
├── app/(app)/                     dashboard/admin/audit/approvals (STRAAL-34/35/36)
├── components/auth/
│   ├── brand-panel.tsx            left marketing panel (static, server component)
│   ├── login-form.tsx             SSO + credentials form (client component)
│   ├── register-form.tsx          create-account form (client component)
│   └── logout-button.tsx          drop into the app shell's user menu
├── lib/auth/
│   ├── auth.ts                    throwaway Auth.js stub (see warning above)
│   ├── constants.ts               provider id + route constants
│   └── error-messages.ts          error code → user-facing copy
├── lib/mock-idp/, app/api/mock-idp/  in-memory OAuth2/PKCE mock IdP
└── server/                        in-memory mock tRPC backend (iam/audit/governance)
    routers so the UI has real request/response shapes to call while the
    real backend prompts (1.2/1.3/1.5) are built.
```

## One deliberate change from the visual reference

The reference screenshot shows separate "Continue with Google" / "Continue
with Microsoft" buttons. This ships one **"Continue with SSO"** button
instead — same visual weight and position, just one entry point instead of
two, matching a single generic OIDC provider.

## What's covered vs. what's stubbed

Covered: email/password validation, show/hide password, remember me, forgot
password link, loading states on both auth paths, inline + banner error
states, session-expired banner, keyboard focus, `aria-live` error region,
logout button, EN/AR i18n.

Stubbed / awaiting the real backend: the actual `credentials` and `oidc`
Auth.js provider configs, rate-limit UI copy, and everything under
`src/server/` (in-memory mock, not real persistence) — see the warning
comments in `src/server/mock-db.ts` and `src/lib/auth/auth.ts`.
