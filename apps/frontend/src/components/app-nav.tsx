"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/locale-context";
import { LogoutButton } from "@/components/auth/logout-button";
import { LocaleSwitcher } from "@/components/locale-switcher";

type Role = "platform_administrator" | "member";

export function AppNav({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const links = [
    { href: "/dashboard", label: t("nav.dashboard") },
    { href: "/audit", label: t("nav.auditLog") },
    ...(role === "platform_administrator"
      ? [
          { href: "/admin", label: t("nav.admin") },
          { href: "/approvals", label: t("nav.approvals") },
        ]
      : []),
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-8">
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            {t("common.appName")}
          </span>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    "rounded-lg px-3 py-1.5 text-[13px] font-medium transition " +
                    (active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LocaleSwitcher className="static" />
          <span className="text-[13px] text-slate-500">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
