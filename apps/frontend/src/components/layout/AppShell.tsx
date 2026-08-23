"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import Sidebar, { NAV_SECTIONS } from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { AssistantProvider, useAssistant } from "@/lib/assistant/assistant-context";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useI18n } from "@/lib/i18n/locale-context";

type Role = "platform_administrator" | "member";

const LEGACY_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  audit: "Audit Log",
  admin: "Admin",
  approvals: "Approvals",
};

function breadcrumbFor(pathname: string): string[] {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
    if (!item) continue;
    if (section.label === "MAIN") return ["Home", item.label];
    const sectionLabel = section.label.charAt(0) + section.label.slice(1).toLowerCase();
    return ["Home", sectionLabel, item.label];
  }
  const slug = pathname.split("/").filter(Boolean)[0] ?? "";
  return ["Home", LEGACY_LABELS[slug] ?? "Home"];
}

export function AppShell({
  email,
  name,
  children,
}: {
  role: Role;
  email: string;
  name: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <AssistantProvider>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} name={name} />
        <div className="app-scroll flex h-dvh min-w-0 w-full flex-col overflow-y-auto overflow-x-hidden bg-slate-50">
          <Topbar breadcrumb={breadcrumbFor(pathname ?? "")} email={email} name={name} onMenuClick={() => setSidebarOpen(true)} />
          <main className="w-full max-w-none flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>

        <AssistantLauncherButton />
        <AssistantPanel />
      </div>
    </AssistantProvider>
  );
}

function AssistantLauncherButton() {
  const { isOpen, toggle } = useAssistant();
  const { t } = useI18n();

  return (
    <button
      type="button"
      title={isOpen ? t("assistant.closeLabel") : t("assistant.openLabel")}
      aria-label={isOpen ? t("assistant.closeLabel") : t("assistant.openLabel")}
      aria-expanded={isOpen}
      onClick={toggle}
      className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-blue-600 text-white shadow-lg hover:brightness-110 rtl:right-auto rtl:left-6"
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
