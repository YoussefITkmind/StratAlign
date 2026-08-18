import { Clock } from "lucide-react";
import { CadenceEvent } from "@/types/calendarEvent";
import { CADENCE_EVENT_TYPES } from "@/data/mockCalendarEvents";

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  events: CadenceEvent[];
  todayKey: string; // YYYY-MM-DD
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function toKey(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function buildWeeks(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { day: number | null; inMonth: boolean }[] = [];

  for (let i = 0; i < firstDay; i++) cells.push({ day: null, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  while (cells.length % 7 !== 0) cells.push({ day: null, inMonth: false });

  const weeks: { day: number | null; inMonth: boolean }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Uses a plain 7-column CSS grid with no explicit `direction`, so under the
// app's dir="rtl" locale the browser mirrors both the weekday header and the
// day cells automatically — no JS-side day reordering needed.
export default function CalendarGrid({ year, month, events, todayKey }: CalendarGridProps) {
  const weeks = buildWeeks(year, month);
  const eventsByDay = new Map<string, CadenceEvent[]>();
  for (const ev of events) {
    const list = eventsByDay.get(ev.date) ?? [];
    list.push(ev);
    eventsByDay.set(ev.date, list);
  }

  const typeMeta = Object.fromEntries(CADENCE_EVENT_TYPES.map((t) => [t.type, t]));

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-3 py-2.5 text-start text-[11px] font-semibold tracking-wide text-gray-400">
            {w}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? "border-b border-gray-100" : ""}`}>
          {week.map((cell, di) => {
            const key = cell.day ? toKey(year, month, cell.day) : `empty-${wi}-${di}`;
            const dayEvents = cell.day ? (eventsByDay.get(toKey(year, month, cell.day)) ?? []) : [];
            const isToday = cell.day !== null && toKey(year, month, cell.day) === todayKey;

            return (
              <div
                key={key}
                className={`flex min-h-[92px] flex-col gap-1 border-e border-gray-100 p-2 last:border-e-0 ${
                  !cell.inMonth ? "bg-gray-50" : ""
                }`}
              >
                {cell.day !== null && (
                  <>
                    <div className="flex">
                      <span
                        className={
                          isToday
                            ? "flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white"
                            : "px-0.5 text-xs text-gray-700"
                        }
                      >
                        {cell.day}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.map((ev) => {
                        const meta = typeMeta[ev.type];
                        return (
                          <div
                            key={ev.id}
                            title={`${ev.time} ${ev.title}`}
                            className={`flex items-center gap-1 overflow-hidden whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-medium ${meta.badgeClass}`}
                          >
                            <Clock className="h-2.5 w-2.5 shrink-0" />
                            <span className="shrink-0 opacity-85">{ev.time}</span>
                            <span className="overflow-hidden text-ellipsis">{ev.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
