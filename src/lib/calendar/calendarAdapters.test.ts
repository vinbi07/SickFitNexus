import { describe, expect, it } from "vitest";
import {
  adaptComplianceToEvents,
  adaptInvoicesToEvents,
  adaptManualEventsToEvents,
  adaptProductionPlansToEvents,
  adaptPurchaseOrdersToEvents,
  adaptRetailersToEvents,
} from "@/lib/calendar/calendarAdapters";
import type {
  Invoice,
  ProductionPlan,
  PurchaseOrder,
  Retailer,
  RetailerComplianceDocument,
  RetailerComplianceRequirement,
} from "@/types/domain";
import type { ManualCalendarEventRow } from "@/lib/calendar/calendarTypes";

const today = "2026-08-03";

function buildPurchaseOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    po_number: "PO-1001",
    vendor_id: null,
    retailer_id: null,
    buyer_id: null,
    location_id: null,
    status: "Ordered",
    po_type: "Manufacturer PO",
    approval_status: "Not Requested",
    allocation_status: "Not Allocated",
    order_date: "2026-07-01",
    ship_date: null,
    submitted_at: null,
    eta_date: null,
    expected_delivery_date: null,
    actual_delivery_date: null,
    invoice_status: null,
    invoice_paid_at: null,
    tracking_number: null,
    shipment_status: null,
    tracking_status: null,
    generated_form_url: null,
    source_channel: null,
    currency_code: "USD",
    bill_to_company_name: null,
    bill_to_contact_name: null,
    bill_to_street: null,
    bill_to_city: null,
    bill_to_state: null,
    bill_to_zip: null,
    bill_to_phone: null,
    bill_to_email: null,
    ship_to_company_name: null,
    ship_to_attention: null,
    ship_to_street: null,
    ship_to_city: null,
    ship_to_state: null,
    ship_to_zip: null,
    ship_to_phone: null,
    payment_terms_snapshot: null,
    buyer_name_snapshot: null,
    approver_name_snapshot: null,
    compliance_snapshot: {},
    buyer_notes: null,
    internal_notes: null,
    hold_reason: null,
    counter_status: "None",
    start_ship_date: null,
    ship_complete_date: null,
    subtotal: 0,
    total_units: 0,
    total_retail: 0,
    requested_action: "draft",
    approved_at: null,
    approved_by: null,
    queued_for_fulfillment_at: null,
    cancelled_at: null,
    total_cost: 1000,
    source_file_name: null,
    notes: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-1",
    invoice_number: "INV-1001",
    source_po_id: null,
    vendor_id: null,
    retailer_id: null,
    buyer_id: null,
    location_id: null,
    status: "Sent",
    order_date: "2026-07-01",
    ship_date: null,
    start_ship_date: null,
    ship_complete_date: null,
    eta_date: null,
    expected_delivery_date: null,
    actual_delivery_date: null,
    submitted_at: null,
    bill_to_company_name: null,
    bill_to_contact_name: null,
    bill_to_street: null,
    bill_to_city: null,
    bill_to_state: null,
    bill_to_zip: null,
    bill_to_phone: null,
    bill_to_email: null,
    ship_to_company_name: null,
    ship_to_attention: null,
    ship_to_street: null,
    ship_to_city: null,
    ship_to_state: null,
    ship_to_zip: null,
    ship_to_phone: null,
    payment_terms_snapshot: null,
    buyer_name_snapshot: null,
    approver_name_snapshot: null,
    subtotal: 0,
    total_cost: 500,
    total_units: 0,
    total_retail: 0,
    currency_code: "USD",
    notes: null,
    buyer_notes: null,
    internal_notes: null,
    source_channel: null,
    invoice_date: null,
    due_date: null,
    customer_po_number: null,
    stock_warnings: [],
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function buildPlan(overrides: Partial<ProductionPlan> = {}): ProductionPlan {
  return {
    id: "plan-1",
    name: "Core Restock",
    goal: "restock",
    status: "Approved",
    vendor_id: null,
    location_id: null,
    horizon_start: "2026-07-01",
    horizon_end: "2026-07-30",
    planned_order_date: null,
    target_arrival_date: null,
    production_lane: null,
    production_week: null,
    demand_method: "avg_daily_usage",
    coverage_target_days: 30,
    safety_stock_override: null,
    include_allocated: true,
    include_existing_incoming: true,
    source_type: "blank",
    source_template_id: null,
    source_plan_id: null,
    active_simulation_run_id: null,
    approved_at: null,
    approved_by: null,
    notes: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("adaptPurchaseOrdersToEvents", () => {
  it("does not crash and produces no events when a PO has no relevant dates", () => {
    const events = adaptPurchaseOrdersToEvents([buildPurchaseOrder({ order_date: null })], today);
    expect(events).toHaveLength(0);
  });

  it("produces an expected-delivery event with an overdue status for a past date on an open PO", () => {
    const events = adaptPurchaseOrdersToEvents(
      [buildPurchaseOrder({ expected_delivery_date: "2026-08-01", status: "Ordered" })],
      today,
    );
    const deliveryEvent = events.find((event) => event.id.endsWith("expected_delivery_date"));
    expect(deliveryEvent?.status).toBe("overdue");
    expect(deliveryEvent?.sourceHref).toBe("/purchase-orders/po-1");
    expect(deliveryEvent?.isEditableDate).toBe(true);
  });

  it("marks a terminal PO's delivery event as completed even if the date has passed", () => {
    const events = adaptPurchaseOrdersToEvents(
      [buildPurchaseOrder({ expected_delivery_date: "2026-08-01", status: "Received" })],
      today,
    );
    expect(events.find((event) => event.id.endsWith("expected_delivery_date"))?.status).toBe("completed");
  });

  it("produces a waiting approval event when approval_status is Pending Approval", () => {
    const events = adaptPurchaseOrdersToEvents(
      [buildPurchaseOrder({ approval_status: "Pending Approval", submitted_at: "2026-07-20T00:00:00Z" })],
      today,
    );
    const approvalEvent = events.find((event) => event.id.endsWith("approval"));
    expect(approvalEvent?.status).toBe("waiting");
    expect(approvalEvent?.date).toBe("2026-07-20");
  });
});

describe("adaptInvoicesToEvents", () => {
  it("skips due-date generation when payment terms are unparseable", () => {
    const events = adaptInvoicesToEvents([buildInvoice({ payment_terms_snapshot: "Due on receipt" })], today);
    expect(events.some((event) => event.id.endsWith("due_date"))).toBe(false);
  });

  it("computes a due date anchored on order_date for Net terms", () => {
    const events = adaptInvoicesToEvents(
      [buildInvoice({ payment_terms_snapshot: "Net 30", order_date: "2026-07-01" })],
      today,
    );
    const dueEvent = events.find((event) => event.id.endsWith("due_date"));
    expect(dueEvent?.date).toBe("2026-07-31");
  });

  it("marks a paid invoice as completed regardless of due date", () => {
    const events = adaptInvoicesToEvents(
      [buildInvoice({ payment_terms_snapshot: "Net 30", order_date: "2026-01-01", status: "Paid" })],
      today,
    );
    expect(events.find((event) => event.id.endsWith("due_date"))?.status).toBe("completed");
  });
});

describe("adaptProductionPlansToEvents", () => {
  it("produces no events when a plan has no dates set", () => {
    expect(adaptProductionPlansToEvents([buildPlan()], today)).toHaveLength(0);
  });

  it("marks a Draft plan's dates as waiting regardless of how far away they are", () => {
    const events = adaptProductionPlansToEvents(
      [buildPlan({ status: "Draft", planned_order_date: "2026-12-01" })],
      today,
    );
    expect(events[0].status).toBe("waiting");
  });
});

describe("adaptRetailersToEvents", () => {
  it("skips retailers with no reorder window", () => {
    const retailer = { next_reorder_start: null, next_reorder_end: null } as unknown as Retailer;
    expect(adaptRetailersToEvents([retailer], today)).toHaveLength(0);
  });

  it("marks a window already ended as completed", () => {
    const retailer = {
      id: "r-1",
      name: "Scheels",
      next_reorder_start: "2026-06-01",
      next_reorder_end: "2026-06-15",
      primary_contact_name: null,
    } as unknown as Retailer;
    expect(adaptRetailersToEvents([retailer], today)[0].status).toBe("completed");
  });
});

describe("adaptComplianceToEvents", () => {
  it("marks a non-compliant requirement as waiting even if expiration is far away", () => {
    const requirement = {
      id: "req-1",
      retailer_id: "r-1",
      requirement_type_id: "type-1",
      status: "Missing",
      expires_at: "2026-12-01",
      notes: null,
    } as unknown as RetailerComplianceRequirement;
    expect(adaptComplianceToEvents([requirement], [], today)[0].status).toBe("waiting");
  });

  it("skips documents with no expiration date", () => {
    const document = { id: "doc-1", expires_at: null } as unknown as RetailerComplianceDocument;
    expect(adaptComplianceToEvents([], [document], today)).toHaveLength(0);
  });
});

describe("adaptManualEventsToEvents", () => {
  it("passes through the stored status and resolves related names from lookup maps", () => {
    const row: ManualCalendarEventRow = {
      id: "manual-1",
      title: "Follow up with buyer",
      description: null,
      event_date: today,
      category: "manual",
      status: "waiting",
      priority: "high",
      owner_label: "Paden",
      retailer_id: "r-1",
      vendor_id: null,
      product_id: null,
      related_entity_type: null,
      related_entity_id: null,
      created_by_user_id: null,
      created_by_label: null,
      created_at: "",
      updated_at: "",
    };
    const retailersById = new Map([["r-1", { name: "Scheels" } as never]]);
    const events = adaptManualEventsToEvents([row], retailersById, new Map(), new Map());
    expect(events[0].status).toBe("waiting");
    expect(events[0].retailerName).toBe("Scheels");
    expect(events[0].isEditableDate).toBe(true);
  });
});
