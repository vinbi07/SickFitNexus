import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_TIME_SETTINGS } from "@/utils/leadTime";
import {
  currentStage,
  expectedStageDates,
  freightModeComparison,
  landedCostPerPair,
  nextStage,
  nextStepLabel,
  stageAlert,
  stageDates,
} from "@/utils/productionStage";

const basePo = {
  status: "Ordered" as const,
  order_date: "2026-06-01",
  invoice_paid_at: null as string | null,
  ship_date: null as string | null,
  actual_delivery_date: null as string | null,
  total_cost: 4000,
  total_units: 2000,
  ship_mode: "Sea" as const,
  freight_cost: 600,
  stage_dates: {} as Record<string, string>,
};

const context = { settings: DEFAULT_LEAD_TIME_SETTINGS, shutdowns: [], today: "2026-06-20" };

describe("stage dates", () => {
  it("reads existing PO columns before stage_dates", () => {
    const po = {
      ...basePo,
      invoice_paid_at: "2026-06-05T14:00:00Z",
      stage_dates: { Paid: "2026-06-04", "In production": "2026-06-06" },
    };
    const dates = stageDates(po);
    expect(dates.Paid).toBe("2026-06-05");
    expect(dates["In production"]).toBe("2026-06-06");
    expect(currentStage(po)).toBe("In production");
    expect(nextStage(po)).toBe("Packing");
  });

  it("starts at Sent to vendor from the order date", () => {
    expect(currentStage(basePo)).toBe("Sent to vendor");
    expect(nextStage(basePo)).toBe("Paid");
    expect(currentStage({ ...basePo, order_date: null })).toBeNull();
  });
});

describe("expected dates and alerts", () => {
  const paid = { ...basePo, invoice_paid_at: "2026-06-01" };

  it("needs a paid date before projecting", () => {
    expect(expectedStageDates(basePo, context)).toBeNull();
    expect(stageAlert(basePo, context)).toBeNull();
    expect(expectedStageDates(paid, context)?.expected.Shipped).toBe("2026-07-01");
  });

  it("warns when the next watched stage is within five days", () => {
    const alert = stageAlert(paid, { ...context, today: "2026-06-23" });
    expect(alert).toMatchObject({ severity: "soon", stage: "Packing", days: 3 });
    expect(alert?.message).toBe("About to be packed in 3 days");
  });

  it("flags the first missed stage as late", () => {
    const alert = stageAlert(paid, { ...context, today: "2026-07-04" });
    expect(alert).toMatchObject({ severity: "late", stage: "Packing", days: 8 });
  });

  it("moves on once a stage is marked", () => {
    const packed = { ...paid, stage_dates: { Packing: "2026-06-26" } };
    const alert = stageAlert(packed, { ...context, today: "2026-07-04" });
    expect(alert).toMatchObject({ severity: "late", stage: "Shipped", days: 3 });
  });

  it("stays quiet for closed orders", () => {
    expect(stageAlert({ ...paid, status: "Cancelled" }, { ...context, today: "2026-09-01" })).toBeNull();
  });

  it("labels the next step for list views", () => {
    expect(nextStepLabel(basePo, context)?.text).toBe("Waiting on payment");
    expect(nextStepLabel(paid, context)).toMatchObject({ tone: "neutral", text: "In production next" });
  });
});

describe("costs", () => {
  it("adds freight into landed cost per pair", () => {
    expect(landedCostPerPair(basePo)).toBeCloseTo(2.3);
    expect(landedCostPerPair({ ...basePo, total_units: 0 })).toBeNull();
  });

  it("compares sea and air freight when both rates are set", () => {
    const rates = { sea_rate_per_pair: 0.3, air_rate_per_pair: 1.4 };
    const comparison = freightModeComparison(basePo, rates);
    expect(comparison?.label).toBe("Air would cost");
    expect(comparison?.amount).toBeCloseTo(2200);
    expect(freightModeComparison({ ...basePo, ship_mode: "Air" }, rates)?.label).toBe("Sea would save");
    expect(freightModeComparison(basePo, { sea_rate_per_pair: null, air_rate_per_pair: 1.4 })).toBeNull();
  });
});
