"use client";

import { CalendarDays, ShieldAlert, ClipboardCheck } from "lucide-react";
import type { CalendarItem, CalendarItemKind } from "@/lib/homeConfig";
import { formatDate } from "@/lib/governanceConfig";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

const KIND_ICON: Record<CalendarItemKind, typeof CalendarDays> = {
  committee: CalendarDays,
  risk: ShieldAlert,
  approval: ClipboardCheck,
};

const KIND_COLOR: Record<CalendarItemKind, string> = {
  committee: "bg-blue-50 text-blue-600",
  risk: "bg-rose-50 text-rose-600",
  approval: "bg-amber-50 text-amber-600",
};

export function ReviewCalendarWidget({ items }: { items: CalendarItem[] }) {
  const { t } = useI18n();

  return (
    <WidgetCard testId="widget-review-calendar" title={t("home.reviewCalendarTitle")} href="/governance" linkLabel={t("home.viewAll")}>
      <ul className="flex flex-col divide-y divide-gray-100">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={item.id} data-testid={`calendar-item-${item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${KIND_COLOR[item.kind]}`}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-gray-800">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-gray-400">{item.detail}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-500">{formatDate(item.date)}</span>
            </li>
          );
        })}
        {items.length === 0 && <p className="text-xs text-gray-400">{t("home.noUpcoming")}</p>}
      </ul>
    </WidgetCard>
  );
}
