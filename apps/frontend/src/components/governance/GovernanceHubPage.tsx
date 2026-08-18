"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ShieldCheck, TriangleAlert } from "lucide-react";
import { mockCalendarEvents } from "@/data/mockCalendarEvents";
import { mockSummary } from "@/data/mockCases";
import { CadenceEvent } from "@/types/calendarEvent";
import CalendarSection from "./calendar/CalendarSection";
import NewEventModal from "./calendar/NewEventModal";
import EscalationSection from "./escalation-board/EscalationSection";
import type { CalendarView } from "./calendar/CalendarHeader";

type Section = "calendar" | "escalations";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function GovernanceHubPage() {
  const [section, setSection] = useState<Section>("calendar");

  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState<CalendarView>("Month");
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CadenceEvent[]>(mockCalendarEvents);
  const [addEventOpen, setAddEventOpen] = useState(false);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;
  const todayKey = toKey(today);

  const eventsInMonth = useMemo(
    () =>
      events.filter((ev) => {
        const [y, m] = ev.date.split("-").map(Number);
        return y === year && m - 1 === month;
      }),
    [events, year, month]
  );

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  const handleAddEvent = (event: CadenceEvent) => setEvents((prev) => [...prev, event]);

  const subtitle =
    section === "calendar"
      ? `${events.length} cadence events · ${monthLabel}`
      : `${mockSummary.unacknowledged} open · ${mockSummary.overdue} overdue SLA · ${mockSummary.nearSla} near SLA`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <ShieldCheck className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h1 className="text-[22px] font-bold text-gray-900">Governance Hub</h1>
            <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 rounded-[10px] border border-gray-200 bg-gray-50 p-[3px]">
          <button
            type="button"
            onClick={() => setSection("calendar")}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              section === "calendar" ? "border border-gray-200 bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Review Calendar
          </button>
          <button
            type="button"
            onClick={() => setSection("escalations")}
            className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              section === "escalations" ? "border border-gray-200 bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <TriangleAlert className="h-3.5 w-3.5" />
            Escalation Board
            {mockSummary.unacknowledged > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {mockSummary.unacknowledged}
              </span>
            )}
          </button>
        </div>
      </div>

      {section === "calendar" ? (
        <CalendarSection
          monthLabel={monthLabel}
          view={view}
          onViewChange={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onAddEvent={() => setAddEventOpen(true)}
          year={year}
          month={month}
          events={eventsInMonth}
          todayKey={todayKey}
        />
      ) : (
        <EscalationSection />
      )}

      {addEventOpen && (
        <NewEventModal
          defaultDate={`${year}-${String(month + 1).padStart(2, "0")}-01`}
          onClose={() => setAddEventOpen(false)}
          onAdd={handleAddEvent}
        />
      )}
    </div>
  );
}
