import { addDays, toDateInput } from "@/utils/date";
import type { CalendarEvent, CalendarView } from "@/lib/calendar/calendarTypes";

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setDate(next.getDate() - next.getDay());
  next.setHours(0, 0, 0, 0);
  return next;
}

/** Month grid always spans full weeks (Sun–Sat), so leading/trailing days from
 * adjacent months are included to keep every row a complete 7-day week. */
export function getMonthGridDays(anchorDate: Date) {
  const firstOfMonth = startOfMonth(anchorDate);
  const gridStart = startOfWeek(firstOfMonth);
  const days: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(gridStart, i));
  }
  return days;
}

export function getWeekDays(anchorDate: Date) {
  const weekStart = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function getVisibleRange(anchorDate: Date, view: CalendarView) {
  if (view === "month") {
    const days = getMonthGridDays(anchorDate);
    return { start: toDateInput(days[0]), end: toDateInput(days[days.length - 1]) };
  }
  if (view === "week") {
    const days = getWeekDays(anchorDate);
    return { start: toDateInput(days[0]), end: toDateInput(days[days.length - 1]) };
  }
  // Agenda: a rolling 60-day window (buffer already applied by caller for fetch, this is display range)
  return { start: toDateInput(addDays(anchorDate, -7)), end: toDateInput(addDays(anchorDate, 60)) };
}

export function isSameMonth(date: Date, anchorDate: Date) {
  return date.getMonth() === anchorDate.getMonth() && date.getFullYear() === anchorDate.getFullYear();
}

export function isSameDay(a: Date, b: Date) {
  return toDateInput(a) === toDateInput(b);
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!event.date) continue;
    const bucket = map.get(event.date) ?? [];
    bucket.push(event);
    map.set(event.date, bucket);
  }
  return map;
}

export function getAgendaDayLabel(dateStr: string, today: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const tomorrow = addDays(todayDate, 1);
  const yesterday = addDays(todayDate, -1);

  if (isSameDay(date, todayDate)) return "Today";
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== todayDate.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

export function formatPeriodLabel(anchorDate: Date, view: CalendarView) {
  if (view === "month") {
    return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(anchorDate);
  }
  if (view === "week") {
    const days = getWeekDays(anchorDate);
    const start = days[0];
    const end = days[days.length - 1];
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(start);
    const endLabel = new Intl.DateTimeFormat("en-US", {
      month: sameMonth ? undefined : "short",
      day: "numeric",
      year: "numeric",
    }).format(end);
    return `${startLabel} – ${endLabel}`;
  }
  return "Upcoming Agenda";
}

export function navigatePeriod(anchorDate: Date, view: CalendarView, direction: 1 | -1) {
  if (view === "month") {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
  }
  if (view === "week") {
    return addDays(anchorDate, 7 * direction);
  }
  return addDays(anchorDate, 30 * direction);
}
