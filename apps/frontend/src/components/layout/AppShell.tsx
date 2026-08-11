"use client";

import { useState, type ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import Sidebar from "@/components/layout/Sidebar";

type Role = "platform_administrator" | "member";

export function AppShell({
  role,
  email,
  children,
}: {
  role: Role;
  email: string;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex h-dvh w-full min-w-0 flex-col overflow-y-auto bg-slate-50">
        <AppNav role={role} email={email} onMenuClick={() => setSidebarOpen(true)} />
        <main className="w-full max-w-none flex-1 mx-0 px-0 py-0">{children}</main>
      </div>
    </div>
  );
}
