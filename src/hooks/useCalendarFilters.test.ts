import { describe, expect, it } from "vitest";
import { filterCalendarEvents, matchesCalendarFilters } from "@/hooks/useCalendarFilters";
import { DEFAULT_CALENDAR_FILTERS, type CalendarEvent, type CalendarFilterState } from "@/lib/calendar/calendarTypes";

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    category: "purchase_order",
    title: "Test event",
    date: "2026-08-03",
    status: "overdue",
    priority: null,
    isAutomaticallyGenerated: true,
    isEditableDate: false,
    sourceType: "purchase_order",
    sourceId: "po-1",
    sourceHref: "/purchase-orders/po-1",
    sourceDateField: null,
    retailerId: "retailer-1",
    retailerName: "Scheels",
    manufacturerId: "vendor-1",
    manufacturerName: "Acme Mfg",
    productId: "product-1",
    productName: "Crew Sock",
    ownerLabel: "Paden",
    amount: 100,
    description: null,
    metadata: {},
    ...overrides,
  };
}

describe("matchesCalendarFilters", () => {
  it("matches an event in a default-visible category (purchase orders) under the default filter state", () => {
    expect(matchesCalendarFilters(buildEvent({ category: "purchase_order" }), DEFAULT_CALENDAR_FILTERS)).toBe(true);
  });

  it("excludes categories not part of the default filter state (e.g. inventory)", () => {
    expect(matchesCalendarFilters(buildEvent({ category: "inventory" }), DEFAULT_CALENDAR_FILTERS)).toBe(false);
  });

  it("combines category and status filters with AND logic", () => {
    const filters: CalendarFilterState = {
      ...DEFAULT_CALENDAR_FILTERS,
      categories: ["purchase_order"],
      statuses: ["overdue"],
    };
    expect(matchesCalendarFilters(buildEvent(), filters)).toBe(true);
    expect(matchesCalendarFilters(buildEvent({ status: "waiting" }), filters)).toBe(false);
    expect(matchesCalendarFilters(buildEvent({ category: "invoice" }), filters)).toBe(false);
  });

  it("rejects events that fail any single filter even if others match", () => {
    const filters: CalendarFilterState = {
      ...DEFAULT_CALENDAR_FILTERS,
      categories: ["purchase_order"],
      retailerId: "retailer-2",
    };
    expect(matchesCalendarFilters(buildEvent(), filters)).toBe(false);
  });

  it("applies overdueOnly as an additional AND condition", () => {
    const filters: CalendarFilterState = { ...DEFAULT_CALENDAR_FILTERS, overdueOnly: true };
    expect(matchesCalendarFilters(buildEvent({ status: "overdue" }), filters)).toBe(true);
    expect(matchesCalendarFilters(buildEvent({ status: "due_soon" }), filters)).toBe(false);
  });

  it("filters manually-created vs automatically-generated events", () => {
    const manualOnly: CalendarFilterState = { ...DEFAULT_CALENDAR_FILTERS, generatedFilter: "manual" };
    expect(matchesCalendarFilters(buildEvent({ isAutomaticallyGenerated: true }), manualOnly)).toBe(false);
    expect(matchesCalendarFilters(buildEvent({ isAutomaticallyGenerated: false }), manualOnly)).toBe(true);
  });
});

describe("filterCalendarEvents", () => {
  it("returns only events matching all active filters", () => {
    const events = [
      buildEvent({ id: "a", category: "purchase_order", status: "overdue" }),
      buildEvent({ id: "b", category: "invoice", status: "overdue" }),
      buildEvent({ id: "c", category: "purchase_order", status: "waiting" }),
    ];
    const filters: CalendarFilterState = {
      ...DEFAULT_CALENDAR_FILTERS,
      categories: ["purchase_order"],
      statuses: ["overdue"],
    };
    expect(filterCalendarEvents(events, filters).map((event) => event.id)).toEqual(["a"]);
  });
});
