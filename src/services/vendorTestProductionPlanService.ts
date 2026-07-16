import { assertSupabase } from "@/lib/supabase";
import { capacityService } from "@/services/capacityService";
import { inventoryService } from "@/services/inventoryService";
import { listTable } from "@/services/baseService";
import { productionPlanService } from "@/services/productionPlanService";
import { productionSimulationService } from "@/services/productionSimulationService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type {
  Location,
  InventoryItem,
  PoLineItem,
  ProductionPlan,
  ProductionSimulationRun,
  PurchaseOrder,
  Retailer,
  ShopifyOrder,
  ShopifyOrderLineItem,
  Product,
  Vendor,
} from "@/types/domain";
import {
  buildVendorTestProductionPlanDrafts,
  type SkippedVendorTestPlan,
} from "@/utils/vendorTestProductionPlans";

export interface GeneratedVendorTestPlan {
  plan: ProductionPlan;
  run: ProductionSimulationRun;
  action: "created" | "refreshed";
  fallbackLabels: string[];
}

export interface GenerateVendorTestPlansResult {
  generated: GeneratedVendorTestPlan[];
  skipped: SkippedVendorTestPlan[];
  protectedPlanCount: number;
}

async function listAllPurchaseOrdersWithLineItems() {
  const supabase = assertSupabase();
  const [posResponse, lineItemsResponse] = await Promise.all([
    supabase.from("purchase_orders").select("*"),
    supabase.from("po_line_items").select("*"),
  ]);
  if (posResponse.error) throw posResponse.error;
  if (lineItemsResponse.error) throw lineItemsResponse.error;

  return {
    purchaseOrders: (posResponse.data ?? []) as PurchaseOrder[],
    poLineItems: (lineItemsResponse.data ?? []) as PoLineItem[],
  };
}

async function listShopifySalesData() {
  const supabase = assertSupabase();
  const [ordersResponse, lineItemsResponse] = await Promise.all([
    supabase.from("shopify_orders").select("*"),
    supabase.from("shopify_order_line_items").select("*"),
  ]);
  if (ordersResponse.error) throw ordersResponse.error;
  if (lineItemsResponse.error) throw lineItemsResponse.error;

  return {
    shopifyOrders: (ordersResponse.data ?? []) as ShopifyOrder[],
    shopifyLineItems: (lineItemsResponse.data ?? []) as ShopifyOrderLineItem[],
  };
}

function getAccountPlanPrefix(retailerName: string) {
  return `[Test] ${retailerName} Account Production Review -`;
}

function findRefreshablePlan(plans: ProductionPlan[], retailerName: string) {
  const prefix = getAccountPlanPrefix(retailerName);
  return plans
    .filter((plan) => plan.name.startsWith(prefix))
    .filter((plan) => plan.status !== "Approved" && plan.status !== "Converted")
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;
}

function countProtectedPlans(plans: ProductionPlan[], retailerName: string) {
  const prefix = getAccountPlanPrefix(retailerName);
  return plans.filter((plan) =>
    plan.name.startsWith(prefix) &&
    (plan.status === "Approved" || plan.status === "Converted")
  ).length;
}

function getRetailerProductMix(params: {
  retailerId: string;
  products: Product[];
  purchaseOrders: PurchaseOrder[];
  poLineItems: PoLineItem[];
}) {
  const productById = new Map(params.products.map((product) => [product.id, product]));
  const productBySku = new Map(params.products.map((product) => [product.sku, product]));
  const productByBarcodeSku = new Map<string, Product>();
  const productByBarcodeUpc = new Map<string, Product>();
  for (const product of params.products) {
    for (const link of product.product_barcode_links ?? []) {
      const barcode = link.product_barcodes;
      if (barcode?.sku) productByBarcodeSku.set(barcode.sku, product);
      if (barcode?.barcode_upc) productByBarcodeUpc.set(barcode.barcode_upc, product);
    }
  }
  const retailerPoIds = new Set(
    params.purchaseOrders
      .filter((po) => po.retailer_id === params.retailerId && po.status !== "Cancelled")
      .map((po) => po.id),
  );

  const unitsByProductId = new Map<string, number>();
  for (const lineItem of params.poLineItems) {
    if (!retailerPoIds.has(lineItem.purchase_order_id)) continue;
    const product =
      (lineItem.product_id ? productById.get(lineItem.product_id) : null) ??
      productBySku.get(lineItem.sku) ??
      productByBarcodeSku.get(lineItem.sku) ??
      (lineItem.upc ? productByBarcodeUpc.get(lineItem.upc) : null);
    if (!product) continue;
    unitsByProductId.set(product.id, (unitsByProductId.get(product.id) ?? 0) + Number(lineItem.quantity_ordered ?? 0));
  }

  return [...unitsByProductId.entries()]
    .map(([productId, units]) => ({ product: productById.get(productId), units }))
    .filter((entry): entry is { product: Product; units: number } => Boolean(entry.product))
    .sort((left, right) => right.units - left.units);
}

function pickPrimaryManufacturer(productMix: Array<{ product: Product; units: number }>, vendors: Vendor[]) {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const unitsByVendorId = new Map<string, number>();
  for (const entry of productMix) {
    if (!entry.product.vendor_id) continue;
    unitsByVendorId.set(entry.product.vendor_id, (unitsByVendorId.get(entry.product.vendor_id) ?? 0) + entry.units);
  }

  const primaryVendorId = [...unitsByVendorId.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  return primaryVendorId ? vendorsById.get(primaryVendorId) ?? null : null;
}

function buildFallbackManufacturer(retailer: Retailer): Vendor {
  return {
    id: "__account_test_unassigned_manufacturer__",
    name: `${retailer.name} - Manufacturer TBD`,
    contact_email: null,
    contact_phone: null,
    lead_time_days: 21,
    average_delay_days: 0,
    reliability_score: 0,
    notes: "Fallback test manufacturer used because selected account SKUs are not assigned to a vendor/manufacturer.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function productHasBarcode(product: Product) {
  return Boolean(product.product_barcode_links?.length);
}

function getFallbackProductMix(products: Product[], inventoryItems: InventoryItem[]) {
  const inventoryProductIds = new Set(inventoryItems.map((item) => item.product_id));
  return products
    .filter((product) => product.sku)
    .filter((product) => productHasBarcode(product) || inventoryProductIds.has(product.id) || Number(product.current_inventory ?? 0) !== 0)
    .map((product) => ({ product, units: 0 }));
}

function applyRetailerContext(params: {
  draft: ReturnType<typeof buildVendorTestProductionPlanDrafts>["drafts"][number];
  retailer: Retailer;
  productMix: Array<{ product: Product; units: number }>;
  selectionSource: string;
  manufacturerWasFallback: boolean;
}) {
  const today = params.draft.plan.horizon_start;
  const unitsByProductId = new Map(params.productMix.map((entry) => [entry.product.id, entry.units]));
  return {
    ...params.draft,
    plan: {
      ...params.draft.plan,
      name: `${getAccountPlanPrefix(params.retailer.name)}${today}`,
      goal: "retailer_launch" as const,
      vendor_id: params.manufacturerWasFallback ? null : params.draft.plan.vendor_id,
      production_lane: params.manufacturerWasFallback ? "Account test plan - manufacturer not assigned" : params.draft.plan.production_lane,
      notes: [
        `Account/Retailer: ${params.retailer.name}.`,
        `Account product selection source: ${params.selectionSource}.`,
        params.manufacturerWasFallback
          ? "Manufacturer fallback: account SKUs were found through product/barcode/inventory records, but those products are not assigned to a vendor/manufacturer yet."
          : null,
        params.draft.plan.notes,
      ].filter(Boolean).join("\n"),
    },
    items: params.draft.items.map((item) => ({
      ...item,
      spec_snapshot: {
        ...(item.spec_snapshot ?? {}),
        retailer_id: params.retailer.id,
        account_name: params.retailer.name,
        account_number: params.retailer.account_number,
        retailer_status: params.retailer.status,
        account_sku_units: unitsByProductId.get(item.product_id) ?? 0,
        account_product_selection_source: params.selectionSource,
        manufacturer_source: params.manufacturerWasFallback ? "fallback_manufacturer_not_assigned" : "product.vendor_id",
      },
    })),
  };
}

export const vendorTestProductionPlanService = {
  async generate(retailerId: string): Promise<GenerateVendorTestPlansResult> {
    if (!retailerId) throw new Error("Select an account before generating a test production plan.");

    const [
      retailers,
      vendors,
      products,
      inventoryEvents,
      inventoryItems,
      { purchaseOrders, poLineItems },
      { shopifyOrders, shopifyLineItems },
      locations,
      existingPlans,
      _capacitySnapshots,
    ] = await Promise.all([
      retailerService.list(),
      vendorService.list(),
      supportService.listProducts(),
      inventoryService.listEvents(),
      listTable<InventoryItem>("inventory_items"),
      listAllPurchaseOrdersWithLineItems(),
      listShopifySalesData(),
      listTable<Location>("locations"),
      productionPlanService.list(),
      capacityService.list(),
    ]);

    const selectedRetailer = retailers.find((retailer) => retailer.id === retailerId);
    if (!selectedRetailer) throw new Error("Selected account could not be found.");

    const retailerProductMix = getRetailerProductMix({ retailerId, products, purchaseOrders, poLineItems });
    const selectionSource = retailerProductMix.length ? "retailer_purchase_order_history" : "fallback_all_catalog_products";
    const fallbackProductMix = getFallbackProductMix(products, inventoryItems);
    const productMix = retailerProductMix.length ? retailerProductMix : fallbackProductMix;
    const primaryManufacturer = pickPrimaryManufacturer(productMix, vendors) ?? buildFallbackManufacturer(selectedRetailer);
    const manufacturerWasFallback = primaryManufacturer.id === "__account_test_unassigned_manufacturer__";

    if (!productMix.length) {
      return {
        generated: [],
        skipped: [{ vendor: primaryManufacturer, reason: "No account products with SKUs, barcode links, or inventory records were found." }],
        protectedPlanCount: countProtectedPlans(existingPlans, selectedRetailer.name),
      };
    }

    const accountProductsForPlan = productMix.map((entry) => ({
      ...entry.product,
      vendor_id: primaryManufacturer.id,
    }));

    const { drafts, skipped } = buildVendorTestProductionPlanDrafts({
      vendors: [primaryManufacturer],
      products: accountProductsForPlan,
      inventoryEvents,
      purchaseOrders,
      poLineItems,
      shopifyOrders,
      shopifyLineItems,
      locations,
    });

    const generated: GeneratedVendorTestPlan[] = [];
    for (const draft of drafts) {
      const accountDraft = applyRetailerContext({
        draft,
        retailer: selectedRetailer,
        productMix,
        selectionSource,
        manufacturerWasFallback,
      });
      const refreshable = findRefreshablePlan(existingPlans, selectedRetailer.name);
      const savedPlan = await productionPlanService.upsert(
        {
          ...(refreshable ? { id: refreshable.id } : {}),
          ...accountDraft.plan,
        },
        accountDraft.items,
      );
      const run = await productionSimulationService.runSimulation(savedPlan.id, "Account Test Plan");
      generated.push({
        plan: { ...savedPlan, status: "Simulated", active_simulation_run_id: run.id },
        run,
        action: refreshable ? "refreshed" : "created",
        fallbackLabels: accountDraft.fallbackLabels,
      });
    }

    return {
      generated,
      skipped,
      protectedPlanCount: countProtectedPlans(existingPlans, selectedRetailer.name),
    };
  },
};
