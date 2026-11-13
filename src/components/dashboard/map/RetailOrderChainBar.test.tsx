import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { retailPoTimeline } from "@/utils/retailPoTimeline";
import { RetailOrderChainBar } from "./RetailOrderChainBar";

const base = {
  status: "In Transit" as const,
  approval_status: "Approved" as const,
  allocation_status: "Fulfilled" as const,
  submitted_at: "2026-10-01T15:00:00Z",
  order_date: null,
  created_at: "2026-10-01T15:00:00Z",
  approved_at: "2026-10-02T15:00:00Z",
  queued_for_fulfillment_at: null,
  ship_date: "2026-10-08",
  actual_delivery_date: null,
  invoice_paid_at: null,
  cancelled_at: null,
  start_ship_date: null,
  ship_complete_date: "2026-10-12",
  eta_date: null,
  expected_delivery_date: null,
};

const order = (poId: string, account: string) => {
  const timeline = retailPoTimeline(base, [], "2026-10-11");
  return {
    poId,
    poNumber: `PO-${poId}`,
    account,
    units: 120,
    value: 4800,
    shipStart: null,
    shipEnd: "2026-10-12",
    steps: timeline.steps,
    alert: timeline.alert,
  };
};

describe("RetailOrderChainBar", () => {
  it("labels chips by account with the PO number on hover, and shows the steps", () => {
    const onSelect = vi.fn();
    render(
      <RetailOrderChainBar
        orders={[order("1", "Campus Store"), order("2", "Run Shop")]}
        selectedId="1"
        today="2026-10-11"
        onSelect={onSelect}
        onOpen={vi.fn()}
        onShowAll={vi.fn()}
      />,
    );
    const chip = screen.getByRole("tab", { name: "Run Shop (PO-2)" });
    expect(chip.getAttribute("title")).toBe("PO-2");
    fireEvent.click(chip);
    expect(onSelect).toHaveBeenCalledWith("2");
    for (const label of ["Order received", "Approved", "Fulfilled", "Shipped", "Delivered", "Paid"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getByText("10 days")).toBeTruthy();
  });
});
