import { Suspense } from "react";
import type { Metadata } from "next";
import { BrandPanel } from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/auth/login-form";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const metadata: Metadata = {
  title: "Sign in · StratAlign",
  description: "Sign in to your StratAlign workspace.",
};

function HelpButton() {
  return (
    <a
      href="/support"
      aria-label="Help"
      className="fixed bottom-6 end-6 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
    >
      ?
    </a>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      <LocaleSwitcher />
      <HelpButton />
    </div>
  );
}
