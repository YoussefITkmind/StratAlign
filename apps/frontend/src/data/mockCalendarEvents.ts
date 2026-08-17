import { CadenceEvent, CadenceEventTypeMeta } from "@/types/calendarEvent";

export const CADENCE_EVENT_TYPES: CadenceEventTypeMeta[] = [
  { type: "review", label: "Strategic Review", dot: "bg-blue-500", badgeClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { type: "committee", label: "Committee Meeting", dot: "bg-violet-500", badgeClass: "bg-violet-50 text-violet-700 border-violet-200" },
  { type: "checkin", label: "KPI Check-in", dot: "bg-emerald-500", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { type: "deadline", label: "Escalation Deadline", dot: "bg-red-500", badgeClass: "bg-red-50 text-red-700 border-red-200" },
];

export const mockCalendarEvents: CadenceEvent[] = [
  { id: "ce-1", date: "2026-08-03", time: "09:00", title: "Q3 Strategy Review", type: "review" },
  { id: "ce-2", date: "2026-08-05", time: "14:00", title: "Risk Committee Sync", type: "committee" },
  { id: "ce-3", date: "2026-08-10", time: "11:00", title: "KPI Check-in — Revenue", type: "checkin" },
  { id: "ce-4", date: "2026-08-12", time: "16:30", title: "Value Gate Escalation Due", type: "deadline" },
  { id: "ce-5", date: "2026-08-17", time: "10:00", title: "EXCO Review Pack", type: "review" },
  { id: "ce-6", date: "2026-08-17", time: "13:00", title: "KPI Check-in — Ops", type: "checkin" },
  { id: "ce-7", date: "2026-08-19", time: "09:30", title: "Governance Committee Meeting", type: "committee" },
  { id: "ce-8", date: "2026-08-21", time: "17:00", title: "Approval SLA Deadline", type: "deadline" },
  { id: "ce-9", date: "2026-08-24", time: "10:00", title: "Q3 Strategy Review — Follow-up", type: "review" },
  { id: "ce-10", date: "2026-08-26", time: "11:30", title: "KPI Check-in — Customer", type: "checkin" },
  { id: "ce-11", date: "2026-08-31", time: "15:00", title: "Month-End Committee Meeting", type: "committee" },
];
