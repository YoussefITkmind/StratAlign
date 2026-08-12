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

For local end-to-end tests, sign in with the deterministic credentials seeded
by the test setup:

```
email:    demo@stratalign.dev
password: password123
```

Production authentication is configured in `src/auth.ts`: Auth.js delegates
credential validation and OIDC identity reconciliation to the persisted
backend IAM service. The "Continue with SSO" path uses the configured generic
OIDC provider. Local Playwright tests point that provider at
`src/app/api/mock-idp/*`, an in-memory authorization-code + PKCE test IdP whose
deterministic identities live in `src/lib/mock-idp/users.ts`; it is testing
infrastructure, not a business-data persistence layer.

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
│   ├── auth.ts                    compatibility re-export of canonical src/auth.ts
│   ├── constants.ts               provider id + route constants
│   └── error-messages.ts          error code → user-facing copy
├── lib/mock-idp/, app/api/mock-idp/  in-memory OAuth2/PKCE mock IdP
└── server/                        authenticated tRPC adapters for persisted backend services
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

The local mock OIDC routes and identities are intentionally retained only for
authentication testing. Application IAM, audit, governance, Registry, Rules,
Strategy, Capture, and Performance data flow through persisted backend
services rather than browser or frontend-local business stores.
