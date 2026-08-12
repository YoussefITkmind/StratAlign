"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function WidgetCard({
  title,
  subtitle,
  href,
  linkLabel,
  testId,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-400">{subtitle}</p>}
        </div>
        {href && (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            {linkLabel}
            <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
