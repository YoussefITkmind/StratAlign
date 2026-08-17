import { CADENCE_EVENT_TYPES } from "@/data/mockCalendarEvents";

export default function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 py-2 pb-4 text-xs text-gray-500">
      {CADENCE_EVENT_TYPES.map((t) => (
        <span key={t.type} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} />
          {t.label}
        </span>
      ))}
    </div>
  );
}
