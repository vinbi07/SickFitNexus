import { describe, expect, it } from "vitest";
import type { PurchaseOrderStatusHistory } from "@/types/domain";
import { retailPoTimeline } from "./retailPoTimeline";

const basePo = {
  status: "Pending" as const,
  approval_status: "Not Requested" as const,
  allocation_status: "Not Allocated" as const,
  submitted_at: "2026-10-01T15:00:00Z",
  order_date: null,
  created_at: "2026-09-30T10:00:00Z",
  approved_at: null,
  queued_for_fulfillment_at: null,
  ship_date: null,
  actual_delivery_date: null,
  invoice_paid_at: null,
  cancelled_at: null,
  start_ship_date: null,
  ship_complete_date: null,
  eta_date: null,
  expected_delivery_date: null,
};

const states = (timeline: ReturnType<typeof retailPoTimeline>) =>
  Object.fromEntries(timeline.steps.map((step) => [step.step, step.state]));

describe("retailPoTimeline", () => {
  it("starts with only the order received and approval next", () => {
    const timeline = retailPoTimeline(basePo, [], "2026-10-02");
    expect(timeline.steps[0]).toMatchObject({ step: "Received", date: "2026-10-01", state: "done" });
    expect(states(timeline)).toMatchObject({ Approved: "next", Queued: "todo", Paid: "todo" });
    expect(timeline.alert).toBeNull();
  });

  it("marks earlier steps done when a later one happened, and dates fulfilment from history", () => {
    const history = [
      { to_status: "Fulfilled", created_at: "2026-10-09T18:00:00Z" },
    ] as PurchaseOrderStatusHistory[];
    const timeline = retailPoTimeline({ ...basePo, status: "In Transit", ship_date: "2026-10-10" }, history, "2026-10-11");
    expect(states(timeline)).toMatchObject({
      Approved: "done",
      Queued: "done",
      Fulfilled: "done",
      Shipped: "done",
      Delivered: "next",
    });
    expect(timeline.steps.find((step) => step.step === "Fulfilled")?.date).toBe("2026-10-09");
    expect(timeline.steps.find((step) => step.step === "Approved")?.date).toBeNull();
  });

  it("keeps Paid separate from the shipping chain", () => {
    const timeline = retailPoTimeline({ ...basePo, invoice_paid_at: "2026-10-03T12:00:00Z" }, [], "2026-10-04");
    expect(states(timeline)).toMatchObject({ Paid: "done", Approved: "next", Shipped: "todo" });
  });

  it("warns when the ship-by date has passed or is close", () => {
    expect(retailPoTimeline({ ...basePo, ship_complete_date: "2026-10-05" }, [], "2026-10-08").alert).toEqual({
      severity: "late",
      message: "3 days past the ship-by date",
    });
    expect(retailPoTimeline({ ...basePo, ship_complete_date: "2026-10-10" }, [], "2026-10-08").alert?.severity).toBe("soon");
    expect(
      retailPoTimeline({ ...basePo, ship_complete_date: "2026-10-05", ship_date: "2026-10-04" }, [], "2026-10-08").alert,
    ).toBeNull();
  });

  it("shows open steps as cancelled on a cancelled order", () => {
    const timeline = retailPoTimeline(
      { ...basePo, status: "Cancelled", cancelled_at: "2026-10-04T09:00:00Z" },
      [],
      "2026-10-05",
    );
    expect(timeline.cancelledOn).toBe("2026-10-04");
    expect(states(timeline)).toMatchObject({ Received: "done", Approved: "cancelled", Paid: "cancelled" });
    expect(timeline.alert).toBeNull();
  });
});
