import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_TIME_SETTINGS,
  diffInDays,
  expectedMilestones,
  orderByDate,
  shiftDays,
  totalLeadDays,
} from "@/utils/leadTime";

const settings = DEFAULT_LEAD_TIME_SETTINGS;
const cny = { name: "Chinese New Year 2027", start_date: "2027-01-23", end_date: "2027-02-27" };

describe("date helpers", () => {
  it("shifts across month and DST boundaries without drift", () => {
    expect(shiftDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(shiftDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(diffInDays("2027-02-27", "2027-01-23")).toBe(35);
  });
});

describe("expectedMilestones", () => {
  it("counts forward from the paid date with no shutdown", () => {
    const result = expectedMilestones("2026-06-01", "Sea", settings);
    expect(result).toEqual({
      inProduction: "2026-06-01",
      packing: "2026-06-26",
      shipped: "2026-07-01",
      atUsPort: "2026-08-05",
      received: "2026-08-12",
      shutdownsApplied: [],
    });
  });

  it("uses air transit days for air orders", () => {
    const result = expectedMilestones("2026-06-01", "Air", settings);
    expect(result.atUsPort).toBe("2026-07-11");
    expect(result.received).toBe("2026-07-18");
  });

  it("pushes production out when it overlaps a shutdown", () => {
    const result = expectedMilestones("2027-01-10", "Sea", settings, [cny]);
    // 30 production days end 2027-02-09, plus the 35-day shutdown.
    expect(result.shipped).toBe("2027-03-16");
    expect(result.shutdownsApplied).toEqual(["Chinese New Year 2027"]);
  });

  it("ignores shutdowns outside the production run", () => {
    const result = expectedMilestones("2026-06-01", "Sea", settings, [cny]);
    expect(result.shutdownsApplied).toEqual([]);
    expect(result.shipped).toBe("2026-07-01");
  });
});

describe("orderByDate", () => {
  it("counts back the full lead time for sea and air", () => {
    expect(orderByDate("2027-11-01", "Sea", settings).orderBy).toBe(
      shiftDays("2027-11-01", -totalLeadDays("Sea", settings)),
    );
    expect(orderByDate("2027-11-01", "Air", settings).orderBy).toBe("2027-09-08");
  });

  it("moves the order date earlier when production overlaps a shutdown", () => {
    const plain = orderByDate("2027-03-15", "Sea", settings);
    const withCny = orderByDate("2027-03-15", "Sea", settings, [cny]);
    expect(withCny.ship).toBe(plain.ship);
    expect(diffInDays(plain.orderBy, withCny.orderBy)).toBe(35);
    expect(withCny.shutdownsApplied).toEqual(["Chinese New Year 2027"]);
  });

  it("round-trips with expectedMilestones when there is no shutdown", () => {
    const { orderBy } = orderByDate("2027-07-15", "Sea", settings);
    const received = expectedMilestones(orderBy, "Sea", settings).received;
    expect(shiftDays(received, settings.buffer_days)).toBe("2027-07-15");
  });
});
