import type {
  InventoryEvent,
  Location,
  PoLineItem,
  Product,
  ProductionPlan,
  ProductionPlanItem,
  PurchaseOrder,
  ShopifyOrder,
  ShopifyOrderLineItem,
  Vendor,
} from "@/types/domain";
import { addDays, daysBetween, toDateInput } from "@/utils/date";
import { calculateAverageDailyUsage, calculateForecastMetric } from "@/utils/forecasting";
import {
  getIncomingQuantityForProduct,
  isHiddenByDefaultProductName,
  isInventoryDanger,
} from "@/utils/operations";
import { roundToMoqIncrement } from "@/utils/productionSimulation";

const COVERAGE_TARGET_DAYS = 45;
const REVIEW_BUFFER_DAYS = 14;
const ORDER_REVIEW_BUFFER_DAYS = 5;
const DEFAULT_LEAD_TIME_DAYS = 21;
const DEFAULT_UNIT_COST = 4;
const DEFAULT_ORDER_INCREMENT = 12;
const MAX_SKUS_PER_VENDOR_PLAN = 18;

export interface VendorTestProductionPlanInput {
  vendors: Vendor[];
  products: Product[];
  inventoryEvents: InventoryEvent[];
  purchaseOrders: PurchaseOrder[];
  poLineItems: PoLineItem[];
  shopifyOrders: ShopifyOrder[];
  shopifyLineItems: ShopifyOrderLineItem[];
  locations: Location[];
  referenceDate?: Date;
}

export interface VendorTestPlanItemDraft extends Partial<ProductionPlanItem> {
  product_id: string;
}

export interface VendorTestProductionPlanDraft {
  vendor: Vendor;
  plan: Partial<ProductionPlan>;
  items: VendorTestPlanItemDraft[];
  fallbackLabels: string[];
}

export interface SkippedVendorTestPlan {
  vendor: Vendor;
  reason: string;
}

export interface VendorTestProductionPlanBuildResult {
  drafts: VendorTestProductionPlanDraft[];
  skipped: SkippedVendorTestPlan[];
}

interface ProductPlanningSignal {
  product: Product;
  item: VendorTestPlanItemDraft;
  needsReview: boolean;
  urgencyScore: number;
  fallbackLabels: string[];
}

function groupByProductId(events: InventoryEvent[]) {
  const grouped = new Map<string, InventoryEvent[]>();
  for (const event of events) {
    if (!event.product_id) continue;
    const bucket = grouped.get(event.product_id) ?? [];
    bucket.push(event);
    grouped.set(event.product_id, bucket);
  }
  return grouped;
}

function groupLineItemsByPo(lineItems: PoLineItem[]) {
  const grouped = new Map<string, PoLineItem[]>();
  for (const lineItem of lineItems) {
    const bucket = grouped.get(lineItem.purchase_order_id) ?? [];
    bucket.push(lineItem);
    grouped.set(lineItem.purchase_order_id, bucket);
  }
  return grouped;
}

function getDefaultLocation(locations: Location[]) {
  return (
    locations.find((location) => /warehouse|dc|distribution/i.test(`${location.name} ${location.type ?? ""}`)) ??
    locations[0] ??
    null
  );
}

function getVendorLeadTime(vendor: Vendor) {
  const configured = Number(vendor.lead_time_days ?? 0);
  const averageDelay = Math.max(Math.ceil(Number(vendor.average_delay_days ?? 0)), 0);
  if (configured > 0) {
    return {
      days: configured + averageDelay,
      source: averageDelay > 0 ? "vendor_lead_time_plus_average_delay" : "vendor_lead_time",
    };
  }
  return {
    days: DEFAULT_LEAD_TIME_DAYS + averageDelay,
    source: averageDelay > 0 ? "fallback_21_days_plus_average_delay" : "fallback_21_days",
  };
}

function getTrailingInventoryDailyDemand(events: InventoryEvent[], referenceDate: Date, windowDays = 90) {
  const cutoff = addDays(referenceDate, -windowDays);
  const windowed = events.filter((event) => new Date(`${event.event_date}T00:00:00`) >= cutoff);
  return calculateAverageDailyUsage(windowed);
}

function getTrailingShopifySales(params: {
  product: Product;
  orders: ShopifyOrder[];
  lineItems: ShopifyOrderLineItem[];
  referenceDate: Date;
  windowDays?: number;
}) {
  const windowDays = params.windowDays ?? 90;
  const cutoff = addDays(params.referenceDate, -windowDays);
  const ordersById = new Map(params.orders.map((order) => [order.id, order]));

  const quantity = params.lineItems.reduce((sum, lineItem) => {
    const order = ordersById.get(lineItem.shopify_order_record_id);
    if (!order || order.cancelled_at) return sum;
    if (new Date(order.order_created_at) < cutoff) return sum;
    const matchesProduct = lineItem.product_id === params.product.id;
    const matchesSku = Boolean(lineItem.sku && lineItem.sku === params.product.sku);
    return matchesProduct || matchesSku ? sum + Number(lineItem.quantity ?? 0) : sum;
  }, 0);

  return {
    quantity,
    dailyDemand: quantity > 0 ? quantity / windowDays : 0,
  };
}

function getCost(product: Product) {
  const unitCost = Number(product.unit_cost ?? 0);
  if (unitCost > 0) return { value: unitCost, source: "product.unit_cost" };
  return { value: DEFAULT_UNIT_COST, source: "fallback_test_unit_cost" };
}

function getOrderConstraints(product: Product) {
  const casePack = Number(product.case_pack_quantity ?? 0);
  if (casePack > 1) {
    return {
      moq: Math.max(casePack * 2, casePack),
      orderIncrement: casePack,
      source: "product.case_pack_quantity",
    };
  }
  return {
    moq: DEFAULT_ORDER_INCREMENT * 2,
    orderIncrement: DEFAULT_ORDER_INCREMENT,
    source: "fallback_test_case_pack",
  };
}

function riskLabel(stockoutBefore: boolean, stockoutAfter: boolean, belowSafetyBefore: boolean, belowSafetyAfter: boolean) {
  if (stockoutAfter) return "Stockout risk remains after proposed run";
  if (stockoutBefore && !stockoutAfter) return "Stockout risk mitigated by proposed run";
  if (belowSafetyAfter) return "Below safety stock after proposed run";
  if (belowSafetyBefore && !belowSafetyAfter) return "Safety stock restored by proposed run";
  return "On track after proposed run";
}

function buildPlanningSignal(params: {
  product: Product;
  vendor: Vendor;
  productEvents: InventoryEvent[];
  purchaseOrders: PurchaseOrder[];
  lineItemsByPo: Map<string, PoLineItem[]>;
  shopifyOrders: ShopifyOrder[];
  shopifyLineItems: ShopifyOrderLineItem[];
  referenceDate: Date;
}) {
  const { product, vendor, productEvents, purchaseOrders, lineItemsByPo, shopifyOrders, shopifyLineItems, referenceDate } = params;
  const fallbackLabels: string[] = [];
  const leadTime = getVendorLeadTime(vendor);
  if (leadTime.source.startsWith("fallback")) fallbackLabels.push(`${product.sku}: lead time used ${leadTime.source}`);

  const shopifySales = getTrailingShopifySales({ product, orders: shopifyOrders, lineItems: shopifyLineItems, referenceDate });
  const inventoryDailyDemand = getTrailingInventoryDailyDemand(productEvents, referenceDate);
  let dailyDemand = shopifySales.dailyDemand > 0 ? shopifySales.dailyDemand : inventoryDailyDemand;
  let demandSource = shopifySales.dailyDemand > 0 ? "shopify_order_line_items.trailing_90d" : "inventory_events.trailing_90d";

  const availableInventory = Number(product.inventory_available ?? Number(product.current_inventory ?? 0) - Number(product.inventory_allocated ?? 0));
  const currentInventory = Number(product.current_inventory ?? 0);
  const allocatedInventory = Number(product.inventory_allocated ?? 0);
  const safetyStock = Number(product.safety_stock ?? 0);
  const incomingInventory = getIncomingQuantityForProduct(product.id, purchaseOrders, lineItemsByPo);
  const currentPlusIncoming = currentInventory + incomingInventory - allocatedInventory;

  if (dailyDemand <= 0 && currentPlusIncoming <= safetyStock) {
    dailyDemand = Math.max(safetyStock / COVERAGE_TARGET_DAYS, 1);
    demandSource = "fallback_test_daily_demand";
    fallbackLabels.push(`${product.sku}: demand used fallback_test_daily_demand`);
  }

  const coverageDays = dailyDemand > 0 ? Math.max(currentPlusIncoming, 0) / dailyDemand : Number.POSITIVE_INFINITY;
  const forecast = calculateForecastMetric(product, productEvents, leadTime.days);
  const projectedDemandThroughRun = dailyDemand * (leadTime.days + COVERAGE_TARGET_DAYS);
  const incomingCoversDemand = currentPlusIncoming >= projectedDemandThroughRun + safetyStock;
  const modelSuggestedQuantity = Math.max(Math.ceil(projectedDemandThroughRun + safetyStock - currentPlusIncoming), 0);
  const suggestedQuantity = Math.max(modelSuggestedQuantity, Number(forecast.suggestedReorderQuantity ?? 0));

  const needsReview =
    availableInventory <= safetyStock ||
    isInventoryDanger(currentInventory, productEvents) ||
    coverageDays <= leadTime.days + REVIEW_BUFFER_DAYS ||
    suggestedQuantity > 0 ||
    !incomingCoversDemand;

  const cost = getCost(product);
  if (cost.source.startsWith("fallback")) fallbackLabels.push(`${product.sku}: cost used ${cost.source}`);

  const constraints = getOrderConstraints(product);
  if (constraints.source.startsWith("fallback")) fallbackLabels.push(`${product.sku}: MOQ/increment used ${constraints.source}`);

  const demoQuantity = Math.max(Math.ceil(Math.max(dailyDemand, 1) * 30), constraints.moq);
  const plannedQuantity = roundToMoqIncrement(
    needsReview ? Math.max(suggestedQuantity, constraints.moq) : demoQuantity,
    constraints.moq,
    constraints.orderIncrement,
  );
  const inventoryAfterRun = currentPlusIncoming + plannedQuantity;
  const coverageAfterRun = dailyDemand > 0 ? inventoryAfterRun / dailyDemand : Number.POSITIVE_INFINITY;
  const stockoutBefore = dailyDemand > 0 && coverageDays <= leadTime.days;
  const stockoutAfter = dailyDemand > 0 && coverageAfterRun <= leadTime.days;
  const belowSafetyBefore = currentPlusIncoming <= safetyStock;
  const belowSafetyAfter = inventoryAfterRun <= safetyStock;

  const item: VendorTestPlanItemDraft = {
    product_id: product.id,
    planned_quantity: plannedQuantity,
    moq: constraints.moq,
    order_increment: constraints.orderIncrement,
    unit_cost: cost.value,
    manual_daily_demand: shopifySales.dailyDemand > 0 ? shopifySales.dailyDemand : null,
    spec_snapshot: {
      test_plan: true,
      vendor_name: vendor.name,
      sku: product.sku,
      current_inventory: currentInventory,
      allocated_inventory: allocatedInventory,
      available_inventory: availableInventory,
      incoming_inventory: incomingInventory,
      shopify_trailing_90d_units: shopifySales.quantity,
      projected_daily_demand: dailyDemand,
      projected_demand_through_arrival_and_coverage: projectedDemandThroughRun,
      suggested_reorder_quantity: suggestedQuantity,
      final_planned_quantity: plannedQuantity,
      estimated_production_cost: plannedQuantity * cost.value,
      test_quantity_reason: needsReview ? "production_or_reorder_review" : "active_vendor_demo_quantity",
      inventory_risk_before: riskLabel(stockoutBefore, false, belowSafetyBefore, false),
      inventory_risk_after: riskLabel(stockoutBefore, stockoutAfter, belowSafetyBefore, belowSafetyAfter),
      recommended_next_step: stockoutBefore
        ? "Review whether order date can move earlier or a partial run can be expedited."
        : needsReview
          ? "Review and approve the simulated quantity before converting to a Manufacturer PO."
          : "Demo quantity only. No immediate production action is recommended unless the user approves this test scenario.",
      shopify_sales_source: shopifySales.quantity > 0 ? "shopify_orders/shopify_order_line_items" : "no_recent_shopify_sales",
      demand_source: demandSource,
      unit_cost_source: cost.source,
      moq_source: constraints.source,
      lead_time_source: leadTime.source,
      incoming_inventory_source: incomingInventory > 0 ? "eligible_open_purchase_orders" : "no_existing_incoming_inventory",
    },
    pack_pairs: /sock/i.test(product.name) ? 6 : 1,
    sock_size: /sock/i.test(product.name) ? "One Size" : "Standard",
    construction: /sock/i.test(product.name) ? "Production test sock construction" : "Production test cut-and-sew construction",
    cards_used: 0,
    box_no: `TEST-${product.sku}`.slice(0, 40),
    barcode_required: true,
    art_status: "Approved",
    artwork_file_ref: "test-plan/artwork-on-file.pdf",
    rib_lr: true,
    toe: true,
    pattern: false,
    signature: false,
  };

  const urgencyScore = Number.isFinite(coverageDays) ? Math.max(0, Math.round((leadTime.days + REVIEW_BUFFER_DAYS - coverageDays) * 10)) : 0;
  return { product, item, needsReview, urgencyScore, fallbackLabels };
}

function buildPlanNotes(params: {
  vendor: Vendor;
  itemCount: number;
  fallbackLabels: string[];
  leadTimeSource: string;
}) {
  const fallbackText = params.fallbackLabels.length
    ? `Fallback test values used: ${[...new Set(params.fallbackLabels)].join("; ")}.`
    : "No fallback test values were needed; all core plan values came from database-backed records.";
  return [
    "TEST SCENARIO ONLY. This vendor production plan demonstrates the Production Planner before approval/conversion.",
    "Viewing or simulating this plan does not modify live inventory, Shopify records, purchase orders, or Manufacturing POs.",
    `Vendor/manufacturer: ${params.vendor.name}. Included SKU count: ${params.itemCount}.`,
    `Lead-time source: ${params.leadTimeSource}.`,
    fallbackText,
  ].join("\n");
}

export function buildVendorTestProductionPlanDrafts(
  input: VendorTestProductionPlanInput,
): VendorTestProductionPlanBuildResult {
  const referenceDate = input.referenceDate ?? new Date();
  const today = toDateInput(referenceDate);
  const eventsByProductId = groupByProductId(input.inventoryEvents);
  const lineItemsByPo = groupLineItemsByPo(input.poLineItems);
  const defaultLocation = getDefaultLocation(input.locations);
  const productsByVendorId = new Map<string, Product[]>();

  for (const product of input.products) {
    if (!product.vendor_id || !product.sku || isHiddenByDefaultProductName(product.name)) continue;
    const bucket = productsByVendorId.get(product.vendor_id) ?? [];
    bucket.push(product);
    productsByVendorId.set(product.vendor_id, bucket);
  }

  const skipped: SkippedVendorTestPlan[] = [];
  const drafts: VendorTestProductionPlanDraft[] = [];

  for (const vendor of input.vendors) {
    const vendorProducts = productsByVendorId.get(vendor.id) ?? [];
    if (!vendorProducts.length) {
      skipped.push({ vendor, reason: "No assigned visible product SKUs." });
      continue;
    }

    const signals: ProductPlanningSignal[] = vendorProducts
      .map((product) =>
        buildPlanningSignal({
          product,
          vendor,
          productEvents: eventsByProductId.get(product.id) ?? [],
          purchaseOrders: input.purchaseOrders,
          lineItemsByPo,
          shopifyOrders: input.shopifyOrders,
          shopifyLineItems: input.shopifyLineItems,
          referenceDate,
        }),
      )
      .sort((left, right) => right.urgencyScore - left.urgencyScore || right.item.planned_quantity! - left.item.planned_quantity!);

    const reviewSignals = signals.filter((signal) => signal.needsReview && Number(signal.item.planned_quantity ?? 0) > 0);
    const selected = (reviewSignals.length ? reviewSignals : signals).slice(0, MAX_SKUS_PER_VENDOR_PLAN);
    const leadTime = getVendorLeadTime(vendor);
    const plannedOrderDate = toDateInput(addDays(referenceDate, ORDER_REVIEW_BUFFER_DAYS));
    const targetArrivalDate = toDateInput(addDays(new Date(`${plannedOrderDate}T00:00:00`), leadTime.days));
    const horizonEnd = toDateInput(addDays(new Date(`${targetArrivalDate}T00:00:00`), COVERAGE_TARGET_DAYS));
    const fallbackLabels = selected.flatMap((signal) => signal.fallbackLabels);

    drafts.push({
      vendor,
      items: selected.map((signal, index) => ({ ...signal.item, sort_order: index })),
      fallbackLabels: [...new Set(fallbackLabels)],
      plan: {
        name: `[Test] ${vendor.name} Production Review - ${today}`,
        goal: "restock",
        status: "Draft",
        vendor_id: vendor.id,
        location_id: defaultLocation?.id ?? null,
        horizon_start: today,
        horizon_end: horizonEnd,
        planned_order_date: plannedOrderDate,
        target_arrival_date: targetArrivalDate,
        production_lane: `${vendor.name} Test Production Lane`,
        production_week: plannedOrderDate,
        demand_method: "trailing_90d",
        coverage_target_days: COVERAGE_TARGET_DAYS,
        safety_stock_override: null,
        include_allocated: true,
        include_existing_incoming: true,
        source_type: "reorder_queue",
        notes: buildPlanNotes({
          vendor,
          itemCount: selected.length,
          fallbackLabels,
          leadTimeSource: leadTime.source,
        }),
      },
    });
  }

  return { drafts, skipped };
}
