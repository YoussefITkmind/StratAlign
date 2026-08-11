"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { LogoutButton } from "@/components/auth/logout-button";
import { LocaleSwitcher } from "@/components/locale-switcher";

type Role = "platform_administrator" | "member";

export function AppNav({
  role,
  email,
  onMenuClick,
}: {
  role: Role;
  email: string;
  onMenuClick?: () => void;
}) {
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-8">
          <button
            type="button"
            aria-label="Open menu"
            onClick={onMenuClick}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="shrink-0 truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {t("common.appName")}
          </span>
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    "shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition " +
                    (active ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LocaleSwitcher className="static" />
          <span className="hidden truncate text-[13px] text-slate-500 md:inline">{email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
