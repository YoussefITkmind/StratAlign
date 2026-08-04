"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { ROUTES } from "@/lib/auth/constants";

type LogoutButtonProps = {
  className?: string;
  children?: React.ReactNode;
};

/**
 * Drop this in the app shell (nav/user menu). Calls Auth.js's signOut, which
 * clears the local session; single-logout against the OIDC provider (where
 * supported) is handled server-side per Prompt 1.1 — this button doesn't
 * need to know which auth method the user came in through.
 */
export function LogoutButton({ className, children }: LogoutButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await signOut({ callbackUrl: ROUTES.login });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className={
        className ??
        "rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
      }
    >
      {pending ? "Signing out…" : children ?? "Sign out"}
    </button>
  );
}
