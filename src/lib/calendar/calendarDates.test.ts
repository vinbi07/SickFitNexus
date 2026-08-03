import { describe, expect, it } from "vitest";
import {
  getAgendaDayLabel,
  getMonthGridDays,
  getWeekDays,
  groupEventsByDate,
} from "@/lib/calendar/calendarDates";
import type { CalendarEvent } from "@/lib/calendar/calendarTypes";

function buildEvent(id: string, date: string): CalendarEvent {
  return {
    id,
    category: "manual",
    title: id,
    date,
    status: "scheduled",
    priority: null,
    isAutomaticallyGenerated: false,
    isEditableDate: true,
    sourceType: null,
    sourceId: null,
    sourceHref: null,
    sourceDateField: null,
    retailerId: null,
    retailerName: null,
    manufacturerId: null,
    manufacturerName: null,
    productId: null,
    productName: null,
    ownerLabel: null,
    amount: null,
    description: null,
    metadata: {},
  };
}

describe("getMonthGridDays", () => {
  it("always returns 42 days spanning full weeks", () => {
    const days = getMonthGridDays(new Date("2026-08-15T00:00:00"));
    expect(days).toHaveLength(42);
    expect(days[0].getDay()).toBe(0);
    expect(days[41].getDay()).toBe(6);
  });

  it("spans a month boundary correctly", () => {
    const days = getMonthGridDays(new Date("2026-01-15T00:00:00"));
    const hasDecemberDays = days.some((day) => day.getMonth() === 11 && day.getFullYear() === 2025);
    expect(hasDecemberDays).toBe(true);
  });
});

describe("getWeekDays", () => {
  it("returns 7 consecutive days starting on Sunday", () => {
    const days = getWeekDays(new Date("2026-08-15T00:00:00"));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(0);
    expect(days[6].getDay()).toBe(6);
  });
});

describe("groupEventsByDate", () => {
  it("groups events by their date and ignores events with an empty date", () => {
    const events = [buildEvent("a", "2026-08-01"), buildEvent("b", "2026-08-01"), buildEvent("c", "2026-08-02"), buildEvent("d", "")];
    const grouped = groupEventsByDate(events);
    expect(grouped.get("2026-08-01")).toHaveLength(2);
    expect(grouped.get("2026-08-02")).toHaveLength(1);
    expect(grouped.has("")).toBe(false);
  });
});

describe("getAgendaDayLabel", () => {
  const today = "2026-08-03";

  it("labels today's date as Today", () => {
    expect(getAgendaDayLabel(today, today)).toBe("Today");
  });

  it("labels the next day as Tomorrow", () => {
    expect(getAgendaDayLabel("2026-08-04", today)).toBe("Tomorrow");
  });

  it("labels a month-boundary-crossing future date with a full weekday/month/day format", () => {
    expect(getAgendaDayLabel("2026-09-01", today)).toMatch(/Tuesday, Sep 1/);
  });
});
