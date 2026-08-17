import { CadenceEvent } from "@/types/calendarEvent";
import CalendarHeader, { CalendarView } from "./CalendarHeader";
import CalendarLegend from "./CalendarLegend";
import CalendarGrid from "./CalendarGrid";

interface CalendarSectionProps {
  monthLabel: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddEvent: () => void;
  year: number;
  month: number;
  events: CadenceEvent[];
  todayKey: string;
}

export default function CalendarSection({
  monthLabel,
  view,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onAddEvent,
  year,
  month,
  events,
  todayKey,
}: CalendarSectionProps) {
  return (
    <div>
      <CalendarHeader
        monthLabel={monthLabel}
        view={view}
        onViewChange={onViewChange}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        onAddEvent={onAddEvent}
      />

      <CalendarLegend />

      {view === "Month" ? (
        <CalendarGrid year={year} month={month} events={events} todayKey={todayKey} />
      ) : (
        <div className="py-12 text-center text-[13px] text-gray-400">
          {view} view is coming soon &mdash; switch back to Month to see cadence events.
        </div>
      )}
    </div>
  );
}
