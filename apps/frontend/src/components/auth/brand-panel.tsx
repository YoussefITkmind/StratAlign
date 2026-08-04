"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/locale-context";

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M5 10.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="none" stroke="var(--brand-accent, #4FB6C9)" strokeWidth="2" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="var(--brand-accent, #4FB6C9)" strokeWidth="2" />
      <circle cx="16" cy="16" r="3" fill="var(--brand-accent, #4FB6C9)" />
    </svg>
  );
}

/**
 * Renders inline SVG rather than an <img> so the accent color can be driven
 * by the white-label theming engine's CSS custom properties (Phase 0,
 * Prompt 0.2) without shipping a per-tenant asset.
 */
export function BrandPanel({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const checklist = [
    t("brand.checklist1"),
    t("brand.checklist2"),
    t("brand.checklist3"),
    t("brand.checklist4"),
    t("brand.checklist5"),
  ];
  const stats = [
    { value: "2,400+", label: t("brand.statOrganizations") },
    { value: "98%", label: t("brand.statRetention") },
    { value: "4.9★", label: t("brand.statRating") },
  ];

  return (
    <div
      className="relative hidden h-full flex-col justify-between overflow-hidden bg-[#0B1E33] px-10 py-10 text-white lg:flex lg:px-14 lg:py-14"
      style={{
        backgroundImage:
          "linear-gradient(180deg, #0B1E33 0%, #0E2338 55%, #0A1B2E 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 48px), repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 48px)",
        backgroundBlendMode: "normal, normal, normal",
      }}
    >
      <div className="relative z-10 flex flex-col gap-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
            <LogoMark />
          </span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">StratAlign</div>
            <div className="text-[10px] font-medium tracking-[0.16em] text-white/45">
              ENTERPRISE
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-[2.65rem] font-bold leading-[1.08] tracking-tight">
            {t("brand.headlinePrefix")}{" "}
            <span className="block">
              <span style={{ color: "var(--brand-accent, #4FB6C9)" }}>
                {t("brand.headlineAccent")}
              </span>{" "}
              {t("brand.headlineSuffix")}
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
            {t("brand.subtitle")}
          </p>
        </div>

        <ul className="flex flex-col gap-3.5">
          {checklist.map((item) => (
            <li key={item} className="flex items-center gap-3 text-[14px] text-white/75">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                style={{
                  color: "var(--brand-accent, #4FB6C9)",
                  backgroundColor: "rgba(79,182,201,0.15)",
                }}
              >
                <CheckIcon />
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 flex flex-col gap-8">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 backdrop-blur-sm"
            >
              <div className="text-[1.15rem] font-bold tracking-tight">{stat.value}</div>
              <div className="mt-0.5 text-[11px] text-white/45">{stat.label}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] tracking-wide text-white/30">{t("brand.compliance")}</p>
      </div>

      {children}
    </div>
  );
}
