"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export type CalendarView = "Month" | "Quarter" | "Year";

interface CalendarHeaderProps {
  monthLabel: string;
  view: CalendarView;
  onViewChange: (view: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAddEvent: () => void;
}

const VIEWS: CalendarView[] = ["Month", "Quarter", "Year"];

export default function CalendarHeader({ monthLabel, view, onViewChange, onPrev, onNext, onToday, onAddEvent }: CalendarHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-gray-100 py-4">
      <div className="flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              v === view ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Previous"
        onClick={onPrev}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
      >
        <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
      </button>
      <button
        type="button"
        onClick={onToday}
        className="rounded-lg border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Today
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={onNext}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
      >
        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
      </button>

      <span className="ms-1 whitespace-nowrap text-[15px] font-bold text-gray-900">{monthLabel}</span>

      <button
        type="button"
        onClick={onAddEvent}
        className="ms-auto flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="h-4 w-4" />
        New Event
      </button>
    </div>
  );
}
