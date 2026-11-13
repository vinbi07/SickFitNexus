import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PurchaseOrder } from "@/types/domain";
import { RetailPoTimeline } from "./RetailPoTimeline";

vi.mock("@/services/purchaseOrderService", () => ({
  purchaseOrderService: { editRetailStepDate: vi.fn() },
}));

const po = {
  id: "po-1",
  po_number: "RT-1",
  po_type: "Retailer PO",
  status: "In Transit",
  approval_status: "Approved",
  allocation_status: "Fulfilled",
  submitted_at: "2026-10-01T15:00:00Z",
  order_date: null,
  created_at: "2026-10-01T15:00:00Z",
  approved_at: "2026-10-02T15:00:00Z",
  queued_for_fulfillment_at: null,
  ship_date: "2026-10-08",
  actual_delivery_date: null,
  invoice_paid_at: null,
  cancelled_at: null,
  start_ship_date: "2026-10-05",
  ship_complete_date: "2026-10-12",
  eta_date: null,
  expected_delivery_date: null,
} as unknown as PurchaseOrder;

describe("RetailPoTimeline", () => {
  it("renders every step and lets a past step be edited", () => {
    render(<RetailPoTimeline purchaseOrder={po} statusHistory={[]} onChanged={vi.fn()} />);
    expect(screen.getByText("Order Timeline")).toBeTruthy();
    for (const label of ["Order received", "Approved", "Queued to pick", "Fulfilled", "Shipped", "Delivered", "Paid"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    fireEvent.click(screen.getByTitle("Change the Shipped date"));
    expect(screen.getByText("Save date")).toBeTruthy();
    // Fulfilled's date lives in status history, so it isn't editable.
    expect(screen.queryByTitle("Change the Fulfilled date")).toBeNull();
  });

  it("offers Mark delivered once shipped, and points to Fulfill before that", () => {
    const { unmount } = render(<RetailPoTimeline purchaseOrder={po} statusHistory={[]} onChanged={vi.fn()} />);
    expect(screen.getByText("Mark delivered")).toBeTruthy();
    expect(screen.queryByText("Mark shipped")).toBeNull();
    expect(screen.getByText("Mark paid")).toBeTruthy();
    unmount();

    const approvedOnly = {
      ...po,
      status: "Ordered",
      allocation_status: "Allocated",
      ship_date: null,
    } as unknown as PurchaseOrder;
    render(<RetailPoTimeline purchaseOrder={approvedOnly} statusHistory={[]} onChanged={vi.fn()} />);
    expect(screen.queryByText("Mark delivered")).toBeNull();
    expect(screen.getByText(/Next up: Queued to pick/)).toBeTruthy();
  });

  it("is read-only without onChanged", () => {
    render(<RetailPoTimeline purchaseOrder={po} statusHistory={[]} />);
    expect(screen.queryByTitle("Change the Shipped date")).toBeNull();
  });
});
