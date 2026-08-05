"use client";

import { useI18n } from "@/lib/i18n/locale-context";

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className={className ?? "fixed start-6 top-6 z-20"}>
      <label className="sr-only" htmlFor="locale-switcher">
        {t("common.language")}
      </label>
      <select
        id="locale-switcher"
        value={locale}
        onChange={(e) => setLocale(e.target.value as "en" | "ar")}
        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm outline-none transition hover:bg-slate-50"
      >
        <option value="en">EN</option>
        <option value="ar">AR</option>
      </select>
    </div>
  );
}
