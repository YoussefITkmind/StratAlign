"use client";

import {
  Search, Calendar, SlidersHorizontal, Share2, HelpCircle, Bell, ChevronDown,
} from "lucide-react";

const CURRENT_USER = {
  initials: "AM",
  name: "Alex Morgan",
  role: "CSO · StratAlign",
};

export default function Topbar() {
  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-16 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">⌘</kbd>
              <kbd className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-400">K</kbd>
            </div>
          </div>

          <button className="flex shrink-0 items-center gap-2 rounded-full border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Calendar className="h-4 w-4 text-gray-400" />
            Q3 2025: Jul 1 – Sep 30
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>

          <button className="flex shrink-0 items-center gap-2 rounded-full border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <SlidersHorizontal className="h-3.5 w-3.5 text-gray-400" />
            Filters
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <button className="flex items-center gap-1.5 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Share2 className="h-4 w-4" /> Share
          </button>

          <button aria-label="Help" className="text-gray-400 hover:text-gray-600">
            <HelpCircle className="h-5 w-5" />
          </button>

          <button aria-label="Notifications" className="relative text-gray-400 hover:text-gray-600">
            <Bell className="h-5 w-5" />
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              2
            </span>
          </button>

          <button className="flex items-center gap-2.5 rounded-full pl-1 pr-2 hover:bg-gray-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {CURRENT_USER.initials}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-semibold text-gray-900">{CURRENT_USER.name}</span>
              <span className="block text-xs text-gray-500">{CURRENT_USER.role}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-6 py-2 text-sm text-gray-500">
        <span>Home</span>
        <span className="text-gray-300">›</span>
        <span>Strategy</span>
        <span className="text-gray-300">›</span>
        <span className="font-medium text-gray-700">Strategy Hierarchy</span>
      </div>
    </div>
  );
}
