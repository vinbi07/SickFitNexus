import { describe, expect, it } from "vitest";
import { computeDateStatus, getRecommendedNextAction, isNeedsAction } from "@/lib/calendar/calendarStatus";
import type { CalendarEvent } from "@/lib/calendar/calendarTypes";

const today = "2026-08-03";

function buildEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    category: "purchase_order",
    title: "Test event",
    date: today,
    status: "scheduled",
    priority: null,
    isAutomaticallyGenerated: true,
    isEditableDate: false,
    sourceType: "purchase_order",
    sourceId: "po-1",
    sourceHref: "/purchase-orders/po-1",
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
    ...overrides,
  };
}

describe("computeDateStatus", () => {
  it("returns completed when isTerminal is true regardless of date", () => {
    expect(computeDateStatus({ date: "2020-01-01", today, isTerminal: true })).toBe("completed");
  });

  it("returns scheduled when there is no date", () => {
    expect(computeDateStatus({ date: null, today, isTerminal: false })).toBe("scheduled");
  });

  it("treats a past date as overdue", () => {
    expect(computeDateStatus({ date: "2026-08-01", today, isTerminal: false })).toBe("overdue");
  });

  it("treats today as within the at-risk window, not overdue", () => {
    expect(computeDateStatus({ date: today, today, isTerminal: false })).toBe("at_risk");
  });

  it("treats a date at the at-risk boundary as at_risk", () => {
    expect(computeDateStatus({ date: "2026-08-06", today, isTerminal: false, atRiskThresholdDays: 3 })).toBe("at_risk");
  });

  it("treats a date just past the at-risk boundary as due_soon", () => {
    expect(computeDateStatus({ date: "2026-08-07", today, isTerminal: false, atRiskThresholdDays: 3, dueSoonThresholdDays: 7 })).toBe(
      "due_soon",
    );
  });

  it("treats a far-future date as scheduled", () => {
    expect(computeDateStatus({ date: "2026-12-01", today, isTerminal: false })).toBe("scheduled");
  });
});

describe("isNeedsAction", () => {
  it("flags overdue events", () => {
    expect(isNeedsAction(buildEvent({ status: "overdue" }))).toBe(true);
  });

  it("flags at_risk events", () => {
    expect(isNeedsAction(buildEvent({ status: "at_risk" }))).toBe(true);
  });

  it("flags waiting and blocked events", () => {
    expect(isNeedsAction(buildEvent({ status: "waiting" }))).toBe(true);
    expect(isNeedsAction(buildEvent({ status: "blocked" }))).toBe(true);
  });

  it("does not flag a due_soon event with no priority", () => {
    expect(isNeedsAction(buildEvent({ status: "due_soon", priority: null }))).toBe(false);
  });

  it("flags a due_soon event with high priority", () => {
    expect(isNeedsAction(buildEvent({ status: "due_soon", priority: "high" }))).toBe(true);
  });

  it("does not flag completed events", () => {
    expect(isNeedsAction(buildEvent({ status: "completed" }))).toBe(false);
  });
});

describe("getRecommendedNextAction", () => {
  it("returns null for completed events", () => {
    expect(getRecommendedNextAction(buildEvent({ status: "completed" }))).toBeNull();
  });

  it("returns a recommendation for an overdue purchase order", () => {
    expect(getRecommendedNextAction(buildEvent({ category: "purchase_order", status: "overdue" }))).toMatch(/manufacturer/i);
  });

  it("returns null when no mapping exists for the category/status pair", () => {
    expect(getRecommendedNextAction(buildEvent({ category: "manual", status: "scheduled" }))).toBeNull();
  });
});
