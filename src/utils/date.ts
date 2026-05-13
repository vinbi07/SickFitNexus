export function daysBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
