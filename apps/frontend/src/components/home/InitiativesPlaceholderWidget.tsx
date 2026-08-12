"use client";

import { Rocket } from "lucide-react";
import { useI18n } from "@/lib/i18n/locale-context";
import { WidgetCard } from "./WidgetCard";

export function InitiativesPlaceholderWidget() {
  const { t } = useI18n();

  return (
    <WidgetCard testId="widget-initiatives-placeholder" title={t("home.initiativesTitle")}>
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 py-8 text-center">
        <Rocket className="h-5 w-5 text-gray-300" />
        <p className="text-xs text-gray-400">{t("home.initiativesPlaceholder")}</p>
      </div>
    </WidgetCard>
  );
}
