import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { insertTable, listTable, updateTable } from "@/services/baseService";
import type { Alert, InventoryEvent, PoLineItem, Product, PurchaseOrder, ShopifyOrder, ShopifyOrderLineItem, Vendor } from "@/types/domain";
import { calculateForecastMetric, calculateVendorDelay } from "@/utils/forecasting";

export interface AlertListItem extends Alert {
  sourceLabel: string;
  sourceHref: string | null;
}

const INVENTORY_ALERT_TYPES = new Set<Alert["alert_type"]>(["Low Stock", "Projected Stockout"]);

function getSeverityRank(severity: Alert["severity"]) {
  switch (severity) {
    case "Critical":
      return 4;
    case "High":
      return 3;
    case "Medium":
      return 2;
    case "Low":
    default:
      return 1;
  }
}

function getInventoryAlertRank(alert: Alert, product: Product | null | undefined) {
  if (!INVENTORY_ALERT_TYPES.has(alert.alert_type) || !product) return 0;
  if (product.current_inventory <= 0) return 4;
  if (alert.alert_type === "Low Stock") return 3;
  if (alert.alert_type === "Projected Stockout") return 2;
  return 1;
}

function getProductRevenueById(
  products: Product[],
  purchaseOrders: PurchaseOrder[],
  poLineItems: PoLineItem[],
  shopifyOrders: ShopifyOrder[],
  shopifyOrderLineItems: ShopifyOrderLineItem[],
) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const revenueByProductId = new Map<string, number>();
  const lineItemsByPoId = new Map<string, PoLineItem[]>();
  const currentYearStart = `${new Date().getFullYear()}-01-01`;

  poLineItems.forEach((item) => {
    const current = lineItemsByPoId.get(item.purchase_order_id) ?? [];
    current.push(item);
    lineItemsByPoId.set(item.purchase_order_id, current);
  });

  purchaseOrders
    .filter((po) => po.po_type === "Retailer PO" && po.status !== "Cancelled")
    .forEach((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? po.created_at.slice(0, 10);
      if (effectiveDate < currentYearStart) return;

      (lineItemsByPoId.get(po.id) ?? []).forEach((item) => {
        if (!item.product_id) return;
        const product = productById.get(item.product_id);
        const unitPrice = Number(product?.unit_price ?? 0) > 0 ? Number(product?.unit_price ?? 0) : Number(item.unit_cost ?? 0);
        const revenue = unitPrice * Number(item.quantity_ordered ?? 0);
        revenueByProductId.set(item.product_id, (revenueByProductId.get(item.product_id) ?? 0) + revenue);
      });
    });

  const shopifyOrderById = new Map(shopifyOrders.map((order) => [order.id, order]));
  shopifyOrderLineItems.forEach((item) => {
    const order = shopifyOrderById.get(item.shopify_order_record_id);
    if (!order || order.cancelled_at || order.order_created_at.slice(0, 10) < currentYearStart || !item.product_id) return;
    revenueByProductId.set(item.product_id, (revenueByProductId.get(item.product_id) ?? 0) + Number(item.line_total ?? 0));
  });

  return revenueByProductId;
}

export const alertService = {
  async list() {
    const supabase = assertSupabase();
    const [
      alerts,
      productsResponse,
      purchaseOrdersResponse,
      poLineItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
    ] = await Promise.all([
      listTable<Alert>("alerts"),
      supabase.from("products").select("*"),
      supabase.from("purchase_orders").select("*"),
      supabase.from("po_line_items").select("*"),
      supabase.from("shopify_orders").select("*"),
      supabase.from("shopify_order_line_items").select("*"),
    ]);

    [
      productsResponse,
      purchaseOrdersResponse,
      poLineItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const products = (productsResponse.data ?? []) as Product[];
    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const poLineItems = (poLineItemsResponse.data ?? []) as PoLineItem[];
    const shopifyOrders = (shopifyOrdersResponse.data ?? []) as ShopifyOrder[];
    const shopifyOrderLineItems = (shopifyOrderLineItemsResponse.data ?? []) as ShopifyOrderLineItem[];

    const productById = new Map(products.map((product) => [product.id, product]));
    const revenueByProductId = getProductRevenueById(
      products,
      purchaseOrders,
      poLineItems,
      shopifyOrders,
      shopifyOrderLineItems,
    );

    return [...alerts].sort((left, right) => {
      if (left.is_resolved !== right.is_resolved) return Number(left.is_resolved) - Number(right.is_resolved);

      const leftProduct = left.related_entity_type === "product" ? productById.get(left.related_entity_id ?? "") : null;
      const rightProduct = right.related_entity_type === "product" ? productById.get(right.related_entity_id ?? "") : null;
      const inventoryRankDifference = getInventoryAlertRank(right, rightProduct) - getInventoryAlertRank(left, leftProduct);
      if (inventoryRankDifference !== 0) return inventoryRankDifference;

      const leftSeverity = getSeverityRank(left.severity);
      const rightSeverity = getSeverityRank(right.severity);
      if (leftSeverity !== rightSeverity) return rightSeverity - leftSeverity;

      const leftRevenue = leftProduct ? revenueByProductId.get(leftProduct.id) ?? 0 : 0;
      const rightRevenue = rightProduct ? revenueByProductId.get(rightProduct.id) ?? 0 : 0;
      if (leftRevenue !== rightRevenue) return rightRevenue - leftRevenue;

      return right.created_at.localeCompare(left.created_at);
    }).map((alert) => {
      if (alert.related_entity_type === "product") {
        const product = productById.get(alert.related_entity_id ?? "");
        return {
          ...alert,
          sourceLabel: product ? `${product.sku} | ${product.name}` : alert.message,
          sourceHref: "/products",
        } satisfies AlertListItem;
      }

      if (alert.related_entity_type === "purchase_order") {
        const purchaseOrder = purchaseOrders.find((po) => po.id === alert.related_entity_id);
        return {
          ...alert,
          sourceLabel: purchaseOrder ? `PO ${purchaseOrder.po_number}` : alert.message,
          sourceHref: alert.related_entity_id ? `/purchase-orders/${alert.related_entity_id}` : "/purchase-orders",
        } satisfies AlertListItem;
      }

      return {
        ...alert,
        sourceLabel: alert.related_entity_type ? alert.related_entity_type.replace("_", " ") : "Operational alert",
        sourceHref: null,
      } satisfies AlertListItem;
    });
  },
  async resolve(id: string) {
    const resolved = await updateTable<Alert>("alerts", id, {
      is_resolved: true,
      resolved_at: new Date().toISOString(),
    });
    await activityService.create({
      event_type: "alert_resolved",
      entity_type: "alert",
      entity_id: id,
      title: "Alert resolved",
      description: resolved.message,
      metadata: resolved,
    });
    return resolved;
  },
  async generateOperationalAlerts() {
    const supabase = assertSupabase();
    const [productResponse, eventResponse, poResponse, vendorResponse] = await Promise.all([
      supabase.from("products").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("purchase_orders").select("*"),
      supabase.from("vendors").select("*"),
    ]);
    if (productResponse.error) throw productResponse.error;
    if (eventResponse.error) throw eventResponse.error;
    if (poResponse.error) throw poResponse.error;
    if (vendorResponse.error) throw vendorResponse.error;

    const products = (productResponse.data ?? []) as Product[];
    const events = (eventResponse.data ?? []) as InventoryEvent[];
    const purchaseOrders = (poResponse.data ?? []) as PurchaseOrder[];
    const vendors = (vendorResponse.data ?? []) as Vendor[];
    const newAlerts: Partial<Alert>[] = [];

    for (const product of products) {
      const productEvents = events.filter((event) => event.product_id === product.id);
      const vendor = vendors[0];
      const metric = calculateForecastMetric(product, productEvents, vendor?.average_delay_days ?? 5);

      if (product.current_inventory <= product.safety_stock) {
        newAlerts.push({
          alert_type: "Low Stock",
          severity: product.current_inventory <= 0 ? "Critical" : "High",
          message: product.current_inventory <= 0
            ? `${product.name} is out of stock.`
            : `${product.name} is below safety stock.`,
          related_entity_type: "product",
          related_entity_id: product.id,
        });
      }

      if (metric.projectedDaysRemaining !== null && metric.projectedDaysRemaining < 14) {
        newAlerts.push({
          alert_type: "Projected Stockout",
          severity: metric.projectedDaysRemaining < 7 ? "Critical" : "Medium",
          message: `${product.name} is projected to stock out within ${Math.ceil(metric.projectedDaysRemaining)} days.`,
          related_entity_type: "product",
          related_entity_id: product.id,
        });
      }
    }

    for (const po of purchaseOrders) {
      if (!po.expected_delivery_date) {
        newAlerts.push({
          alert_type: "Missing Delivery Date",
          severity: "Medium",
          message: `PO ${po.po_number} is missing an expected delivery date.`,
          related_entity_type: "purchase_order",
          related_entity_id: po.id,
        });
      }

      if (calculateVendorDelay(po) > 3 && po.status !== "Received") {
        newAlerts.push({
          alert_type: "PO Overdue",
          severity: "High",
          message: `PO ${po.po_number} is running ${calculateVendorDelay(po)} days late.`,
          related_entity_type: "purchase_order",
          related_entity_id: po.id,
        });
      }

      if (po.total_cost > 50000) {
        newAlerts.push({
          alert_type: "Unusually Large Order",
          severity: "Medium",
          message: `PO ${po.po_number} exceeds the large-order threshold.`,
          related_entity_type: "purchase_order",
          related_entity_id: po.id,
        });
      }
    }

    if (newAlerts.length === 0) return [];

    const created = (await insertTable<Alert>("alerts", newAlerts)) as Alert[];
    await activityService.create({
      event_type: "alerts_generated",
      entity_type: "alert",
      entity_id: null,
      title: "Operational alerts generated",
      description: `${created.length} alerts created.`,
      metadata: { count: created.length },
    });
    return created;
  },
};
