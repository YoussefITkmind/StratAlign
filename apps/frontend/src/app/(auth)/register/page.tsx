import type { Metadata } from "next";
import Link from "next/link";
import { BrandPanel } from "@/components/auth/brand-panel";
import { RegisterForm } from "@/components/auth/register-form";
import { LocaleSwitcher } from "@/components/locale-switcher";

export const metadata: Metadata = {
  title: "Create account · StratAlign",
  description: "Create your StratAlign workspace account.",
};

function HelpButton() {
  return (
    <Link
      href="/support"
      aria-label="Help"
      className="fixed bottom-6 end-6 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50"
    >
      ?
    </Link>
  );
}

export default function RegisterPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <RegisterForm />
      </div>

      <LocaleSwitcher />
      <HelpButton />
    </div>
  );
}
