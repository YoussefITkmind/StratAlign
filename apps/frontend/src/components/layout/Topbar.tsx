"use client";

import {
  Search, Calendar, SlidersHorizontal, Share2, HelpCircle, Bell, ChevronDown, Menu,
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { getInitials } from "@/lib/user";

export default function Topbar({
  breadcrumb = ["Home", "Strategy", "Strategy Hierarchy"],
  email,
  name,
  role = "Chief Strategy Officer",
  onMenuClick,
}: {
  breadcrumb?: string[];
  email?: string;
  name?: string;
  role?: string;
  onMenuClick?: () => void;
}) {
  const displayName = name ?? email ?? "";
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-y-2 gap-x-2 px-4 py-3 sm:gap-x-3 sm:px-6">
        <button
          type="button"
          aria-label="Open menu"
          onClick={onMenuClick}
          className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative min-w-0 flex-1 sm:max-w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            placeholder="Search..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:pr-16"
          />
          <div className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
            <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">⌘</kbd>
            <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">K</kbd>
          </div>
        </div>

        <button
          aria-label="Date range: Q3 2025, Jul 1 to Sep 30"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:gap-2 sm:px-3.5"
        >
          <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="hidden md:inline">Q3 2025: Jul 1 – Sep 30</span>
          <span className="hidden sm:inline md:hidden">Q3 2025</span>
          <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-gray-400 sm:block" />
        </button>

        <button
          aria-label="Filters"
          className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 px-2.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:gap-2 sm:px-3.5"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
          <span className="hidden sm:inline">Filters</span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 sm:block" />
        </button>

        <button className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 lg:flex">
          <Share2 className="h-4 w-4" /> Share
        </button>

        <button aria-label="Help" className="hidden shrink-0 text-gray-400 hover:text-gray-600 sm:block">
          <HelpCircle className="h-5 w-5" />
        </button>

        <button aria-label="Notifications" className="relative shrink-0 text-gray-400 hover:text-gray-600">
          <Bell className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            2
          </span>
        </button>

        <div className="group relative shrink-0">
          <button
            title={email}
            className="flex items-center gap-2.5 whitespace-nowrap rounded-full pl-1 pr-0 hover:bg-gray-50 md:pr-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {getInitials(displayName)}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-sm font-semibold text-gray-900">{displayName}</span>
              <span className="block text-xs text-gray-500">{role}</span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 text-gray-400 md:block" />
          </button>
          <div className="invisible absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
            <p className="truncate border-b border-gray-100 px-3 py-1.5 text-xs text-gray-400">{email}</p>
            <LogoutButton className="block w-full rounded-none px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2 text-sm text-gray-500 sm:px-6">
        {breadcrumb.map((crumb, i) => (
          <span key={`${crumb}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-300">›</span>}
            <span className={i === breadcrumb.length - 1 ? "font-medium text-gray-700" : ""}>{crumb}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
