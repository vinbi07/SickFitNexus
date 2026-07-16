import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryEvent, InventoryItem, Location, Product, ProductionPlan, Retailer, Vendor } from "@/types/domain";

const supabaseFrom = vi.fn();
const upsert = vi.fn();
const runSimulation = vi.fn();

vi.mock("@/lib/supabase", () => ({
  assertSupabase: () => ({
    from: supabaseFrom,
  }),
}));

vi.mock("@/services/capacityService", () => ({
  capacityService: { list: vi.fn(async () => []) },
}));

vi.mock("@/services/inventoryService", () => ({
  inventoryService: { listEvents: vi.fn(async () => mockEvents) },
}));

vi.mock("@/services/baseService", () => ({
  listTable: vi.fn(async (table: string) => table === "inventory_items" ? mockInventoryItems : mockLocations),
}));

vi.mock("@/services/productionPlanService", () => ({
  productionPlanService: {
    list: vi.fn(async () => mockExistingPlans),
    upsert,
  },
}));

vi.mock("@/services/productionSimulationService", () => ({
  productionSimulationService: {
    runSimulation,
  },
}));

vi.mock("@/services/retailerService", () => ({
  retailerService: { list: vi.fn(async () => mockRetailers) },
}));

vi.mock("@/services/supportService", () => ({
  supportService: { listProducts: vi.fn(async () => mockProducts) },
}));

vi.mock("@/services/vendorService", () => ({
  vendorService: { list: vi.fn(async () => mockVendors) },
}));

let mockVendors: Vendor[];
let mockRetailers: Retailer[];
let mockProducts: Product[];
let mockEvents: InventoryEvent[];
let mockLocations: Location[];
let mockInventoryItems: InventoryItem[];
let mockExistingPlans: ProductionPlan[];

function vendor(overrides: Partial<Vendor> = {}): Vendor {
  return {
    id: "vendor-1",
    name: "Atlas Knits",
    contact_email: null,
    contact_phone: null,
    lead_time_days: 30,
    average_delay_days: 0,
    reliability_score: 90,
    notes: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

function retailer(overrides: Partial<Retailer> = {}): Retailer {
  return {
    id: "retailer-1",
    name: "Campus Outfitters",
    status: "Active",
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    secondary_contacts: null,
    account_number: "ACCT-1",
    supplier_id: null,
    activation_id: null,
    shipping_requirements: null,
    billing_company_name: null,
    billing_contact_name: null,
    billing_street: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
    billing_phone: null,
    billing_email: null,
    shipping_company_name: null,
    shipping_attention: null,
    shipping_street: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip: null,
    shipping_phone: null,
    sop_notes: null,
    parent_retailer_id: null,
    retailer_group: null,
    logo_url: null,
    brand_accent_color: null,
    lookbook_intro: null,
    default_payment_terms: null,
    order_mode_policy: "enabled",
    edi_required: false,
    ordering_cadence_days: null,
    next_reorder_start: null,
    next_reorder_end: null,
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
    current_inventory: 5,
    inventory_available: 5,
    inventory_allocated: 0,
    safety_stock: 25,
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

function event(): InventoryEvent {
  return {
    id: "event-1",
    product_id: "product-1",
    location_id: null,
    related_po_id: null,
    event_type: "Usage",
    quantity_change: -20,
    event_date: "2026-07-01",
    notes: null,
    created_at: "2026-07-01",
  };
}

function location(): Location {
  return {
    id: "loc-1",
    name: "Dallas DC",
    type: "Distribution Center",
    address: null,
    retailer_id: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

function inventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "inventory-1",
    product_id: "product-1",
    location_id: "loc-1",
    quantity_on_hand: 5,
    reorder_point: 0,
    target_stock: 0,
    notes: null,
    inventory_category: "Core",
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

describe("vendorTestProductionPlanService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVendors = [vendor()];
    mockRetailers = [retailer()];
    mockProducts = [product()];
    mockEvents = [event()];
    mockLocations = [location()];
    mockInventoryItems = [inventoryItem()];
    mockExistingPlans = [];

    supabaseFrom.mockImplementation((table: string) => ({
      select: vi.fn(async () => ({
        data: table === "purchase_orders" || table === "po_line_items" || table === "shopify_orders" || table === "shopify_order_line_items" ? [] : [],
        error: null,
      })),
    }));
    upsert.mockImplementation(async (plan: Partial<ProductionPlan>) => ({
      ...plan,
      id: plan.id ?? "generated-plan-1",
      created_at: "2026-07-16",
      updated_at: "2026-07-16",
      items: [],
    }));
    runSimulation.mockResolvedValue({
      id: "run-1",
      plan_id: "generated-plan-1",
      scenario_name: "Account Test Plan",
      simulation_version: 1,
      input_snapshot: {},
      result_snapshot: {},
      recommendations: [],
      is_stale: false,
      created_at: "2026-07-16",
    });
  });

  it("creates one simulated test plan for the selected account without converting or touching live tables", async () => {
    const { vendorTestProductionPlanService } = await import("@/services/vendorTestProductionPlanService");

    const result = await vendorTestProductionPlanService.generate("retailer-1");

    expect(result.generated).toHaveLength(1);
    expect(result.generated[0].action).toBe("created");
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      name: expect.stringContaining("[Test] Campus Outfitters Account Production Review"),
      vendor_id: "vendor-1",
      goal: "retailer_launch",
      source_type: "reorder_queue",
      demand_method: "trailing_90d",
    });
    expect(upsert.mock.calls[0][1][0]).toMatchObject({
      product_id: "product-1",
      spec_snapshot: expect.objectContaining({
        test_plan: true,
        retailer_id: "retailer-1",
        account_name: "Campus Outfitters",
        incoming_inventory_source: "no_existing_incoming_inventory",
      }),
    });
    expect(runSimulation).toHaveBeenCalledWith("generated-plan-1", "Account Test Plan");
    expect(supabaseFrom.mock.calls.map((call) => call[0]).sort()).toEqual([
      "po_line_items",
      "purchase_orders",
      "shopify_order_line_items",
      "shopify_orders",
    ]);
  });

  it("refreshes an existing unapproved generated test plan for the same account", async () => {
    mockExistingPlans = [{
      id: "existing-plan-1",
      name: "[Test] Campus Outfitters Account Production Review - 2026-07-01",
      goal: "retailer_launch",
      status: "Simulated",
      vendor_id: "vendor-1",
      location_id: "loc-1",
      horizon_start: "2026-07-01",
      horizon_end: "2026-09-01",
      planned_order_date: "2026-07-06",
      target_arrival_date: "2026-08-05",
      production_lane: null,
      production_week: null,
      demand_method: "trailing_90d",
      coverage_target_days: 45,
      safety_stock_override: null,
      include_allocated: true,
      include_existing_incoming: true,
      source_type: "reorder_queue",
      source_template_id: null,
      source_plan_id: null,
      active_simulation_run_id: "old-run",
      approved_at: null,
      approved_by: null,
      notes: null,
      created_at: "2026-07-01",
      updated_at: "2026-07-01",
    }];
    const { vendorTestProductionPlanService } = await import("@/services/vendorTestProductionPlanService");

    const result = await vendorTestProductionPlanService.generate("retailer-1");

    expect(result.generated[0].action).toBe("refreshed");
    expect(upsert.mock.calls[0][0]).toMatchObject({ id: "existing-plan-1" });
  });

  it("generates only the selected account plan", async () => {
    mockVendors = [vendor(), vendor({ id: "vendor-2", name: "Bravo Mills" })];
    mockRetailers = [retailer(), retailer({ id: "retailer-2", name: "Arena Shops" })];
    mockProducts = [
      product(),
      product({ id: "product-2", sku: "SOCK-2", vendor_id: "vendor-2" }),
    ];
    const { vendorTestProductionPlanService } = await import("@/services/vendorTestProductionPlanService");

    const result = await vendorTestProductionPlanService.generate("retailer-2");

    expect(result.generated).toHaveLength(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      name: expect.stringContaining("[Test] Arena Shops Account Production Review"),
    });
    expect(upsert.mock.calls[0][1][0].spec_snapshot).toMatchObject({
      retailer_id: "retailer-2",
      account_name: "Arena Shops",
    });
  });

  it("creates an account plan from inventory-tracked SKU products even when manufacturer is not assigned", async () => {
    mockVendors = [];
    mockProducts = [product({ vendor_id: null })];
    mockInventoryItems = [inventoryItem({ product_id: "product-1" })];
    const { vendorTestProductionPlanService } = await import("@/services/vendorTestProductionPlanService");

    const result = await vendorTestProductionPlanService.generate("retailer-1");

    expect(result.generated).toHaveLength(1);
    expect(upsert.mock.calls[0][0]).toMatchObject({
      name: expect.stringContaining("[Test] Campus Outfitters Account Production Review"),
      vendor_id: null,
      production_lane: "Account test plan - manufacturer not assigned",
    });
    expect(upsert.mock.calls[0][0].notes).toContain("Manufacturer fallback");
    expect(upsert.mock.calls[0][1][0]).toMatchObject({
      product_id: "product-1",
      spec_snapshot: expect.objectContaining({
        manufacturer_source: "fallback_manufacturer_not_assigned",
        account_product_selection_source: "fallback_all_catalog_products",
      }),
    });
  });
});
