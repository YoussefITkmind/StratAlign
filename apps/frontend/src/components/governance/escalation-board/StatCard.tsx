import { ReactNode } from "react";

export type StatTone = "neutral" | "warning" | "info" | "danger";

const TONE_CLASSES: Record<StatTone, string> = {
  neutral: "bg-gray-100 text-gray-500",
  warning: "bg-red-50 text-red-400",
  info: "bg-amber-50 text-amber-500",
  danger: "bg-violet-50 text-violet-500",
};

interface StatCardProps {
  icon: ReactNode;
  value: number;
  label: string;
  tone?: StatTone;
}

export default function StatCard({ icon, value, label, tone = "neutral" }: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3.5 rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[22px] font-bold leading-tight text-gray-900">{value}</div>
        <div className="truncate text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}
