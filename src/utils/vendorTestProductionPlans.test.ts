import { describe, expect, it } from "vitest";
import type { InventoryEvent, Location, Product, ShopifyOrder, ShopifyOrderLineItem, Vendor } from "@/types/domain";
import { buildVendorTestProductionPlanDrafts } from "@/utils/vendorTestProductionPlans";

const now = new Date("2026-07-16T12:00:00");

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "vendor-1",
    name: "Atlas Knits",
    contact_email: null,
    contact_phone: null,
    lead_time_days: 30,
    average_delay_days: 2,
    reliability_score: 90,
    notes: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    parent_product_id: null,
    sku: "SOCK-1",
    upc: null,
    name: "Quarter Sock",
    variant_title: null,
    variant_sort_order: 0,
    category: "Socks",
    description: null,
    vendor_id: "vendor-1",
    unit_cost: 5,
    unit_price: 12,
    pack_size: null,
    case_pack_quantity: 12,
    wholesale_price: 8,
    msrp: 12,
    weight: null,
    dimensions: null,
    current_inventory: 10,
    inventory_available: 8,
    inventory_allocated: 2,
    safety_stock: 20,
    image_url: null,
    compliance_docs_required: [],
    compliance_docs_status: null,
    no_bundles: false,
    shopify_product_id: null,
    shopify_variant_id: null,
    shopify_handle: null,
    shopify_admin_url: null,
    shopify_storefront_url: null,
    is_shopify_synced: false,
    last_shopify_sync_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function usage(productId = "product-1", quantity = -10, date = "2026-07-01"): InventoryEvent {
  return {
    id: `event-${productId}-${date}`,
    product_id: productId,
    location_id: null,
    related_po_id: null,
    event_type: "Usage",
    quantity_change: quantity,
    event_date: date,
    notes: null,
    created_at: date,
  };
}

const location: Location = {
  id: "loc-1",
  name: "Dallas DC",
  type: "Distribution Center",
  address: null,
  retailer_id: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

function build(overrides: Partial<Parameters<typeof buildVendorTestProductionPlanDrafts>[0]> = {}) {
  return buildVendorTestProductionPlanDrafts({
    vendors: [vendor()],
    products: [product()],
    inventoryEvents: [usage()],
    purchaseOrders: [],
    poLineItems: [],
    shopifyOrders: [],
    shopifyLineItems: [],
    locations: [location],
    referenceDate: now,
    ...overrides,
  });
}

describe("buildVendorTestProductionPlanDrafts", () => {
  it("skips vendors without assigned visible products", () => {
    const result = build({ products: [product({ vendor_id: null })] });

    expect(result.drafts).toHaveLength(0);
    expect(result.skipped[0].reason).toContain("No assigned visible product SKUs");
  });

  it("creates a clearly labeled demo plan when assigned SKUs do not require urgent review", () => {
    const result = build({
      products: [product({ current_inventory: 1000, inventory_available: 1000, safety_stock: 20 })],
      inventoryEvents: [usage("product-1", -1, "2026-05-01")],
    });

    expect(result.drafts).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(result.drafts[0].items[0].planned_quantity).toBeGreaterThan(0);
    expect(result.drafts[0].items[0].spec_snapshot).toMatchObject({
      suggested_reorder_quantity: 0,
      test_quantity_reason: "active_vendor_demo_quantity",
      recommended_next_step: "Demo quantity only. No immediate production action is recommended unless the user approves this test scenario.",
    });
  });

  it("includes low-stock SKUs and labels Shopify demand, costs, MOQ, and lead-time sources", () => {
    const shopifyOrder: ShopifyOrder = {
      id: "shopify-order-1",
      shopify_order_id: "gid://shopify/Order/1",
      order_name: "#1001",
      source_name: "web",
      currency_code: "USD",
      order_created_at: "2026-07-10T00:00:00Z",
      cancelled_at: null,
      current_total_price: 900,
      created_at: "2026-07-10",
      updated_at: "2026-07-10",
    };
    const shopifyLineItem: ShopifyOrderLineItem = {
      id: "line-1",
      shopify_line_item_id: "gid://shopify/LineItem/1",
      shopify_order_record_id: "shopify-order-1",
      product_id: "product-1",
      sku: "SOCK-1",
      title: "Quarter Sock",
      quantity: 90,
      unit_price: 10,
      line_total: 900,
      created_at: "2026-07-10",
      updated_at: "2026-07-10",
    };

    const result = build({
      vendors: [vendor({ lead_time_days: 0 })],
      products: [product({ unit_cost: 0, case_pack_quantity: 0 })],
      shopifyOrders: [shopifyOrder],
      shopifyLineItems: [shopifyLineItem],
    });

    expect(result.drafts).toHaveLength(1);
    const item = result.drafts[0].items[0];
    expect(item.planned_quantity).toBeGreaterThan(0);
    expect(item.planned_quantity! % 12).toBe(0);
    expect(item.unit_cost).toBe(4);
    expect(item.spec_snapshot).toMatchObject({
      shopify_sales_source: "shopify_orders/shopify_order_line_items",
      demand_source: "shopify_order_line_items.trailing_90d",
      unit_cost_source: "fallback_test_unit_cost",
      moq_source: "fallback_test_case_pack",
      lead_time_source: "fallback_21_days_plus_average_delay",
    });
    expect(result.drafts[0].plan.notes).toContain("Fallback test values used");
  });

  it("accounts for incoming PO inventory when planning quantity", () => {
    const noIncoming = build();
    const withIncoming = build({
      purchaseOrders: [{
        id: "po-1",
        po_number: "PO-1",
        vendor_id: "vendor-1",
        retailer_id: null,
        buyer_id: null,
        location_id: "loc-1",
        status: "Ordered",
        po_type: "Manufacturer PO",
        approval_status: "Not Requested",
        allocation_status: "Not Allocated",
        order_date: "2026-07-01",
        ship_date: null,
        submitted_at: null,
        eta_date: "2026-07-25",
        expected_delivery_date: "2026-07-25",
        actual_delivery_date: null,
        invoice_status: "Open",
        invoice_paid_at: null,
        tracking_number: null,
        shipment_status: null,
        tracking_status: null,
        generated_form_url: null,
        source_channel: null,
        currency_code: null,
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
        requested_action: "draft",
        internal_notes: null,
        hold_reason: null,
        counter_status: "None",
        start_ship_date: null,
        ship_complete_date: null,
        subtotal: 0,
        total_units: 0,
        total_retail: 0,
        approved_at: null,
        approved_by: null,
        queued_for_fulfillment_at: null,
        cancelled_at: null,
        total_cost: 0,
        source_file_name: null,
        notes: null,
        source_production_plan_id: null,
        source_simulation_run_id: null,
        created_at: "2026-07-01",
        updated_at: "2026-07-01",
      }],
      poLineItems: [{
        id: "po-line-1",
        purchase_order_id: "po-1",
        product_id: "product-1",
        sku: "SOCK-1",
        upc: null,
        product_name: "Quarter Sock",
        variant_label: null,
        description: null,
        unit: "Each",
        case_pack_quantity: 12,
        case_quantity: 0,
        unit_quantity: 0,
        quantity_ordered: 120,
        quantity_received: 0,
        unit_cost: 5,
        unit_retail: 12,
        line_total: 600,
        extended_cost: 600,
        extended_retail: 1440,
        sort_order: 0,
        created_at: "2026-07-01",
        updated_at: "2026-07-01",
      }],
    });

    expect(withIncoming.drafts[0].items[0].planned_quantity).toBeLessThan(noIncoming.drafts[0].items[0].planned_quantity ?? 0);
    expect(withIncoming.drafts[0].items[0].spec_snapshot).toMatchObject({
      incoming_inventory: 120,
      incoming_inventory_source: "eligible_open_purchase_orders",
    });
  });
});
