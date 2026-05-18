import { assertSupabase } from "@/lib/supabase";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import type {
  ActivityEvent,
  Alert,
  CsvImport,
  DashboardSnapshot,
  InventoryEvent,
  InventoryItem,
  PoLineItem,
  Product,
  PurchaseOrder,
  Retailer,
  ShopifyOrder,
  ShopifyOrderLineItem,
  Sop,
  Vendor,
} from "@/types/domain";
import { getAverageTimelineDays, getProductionTimelineExceptionCount, getProductionTimelineRows, getProductionTimelineTrend } from "@/utils/productionTimeline";
import {
  buildSkuReorderWindow,
  getIncomingQuantityForProduct,
  getInventoryHealthTone,
  getInvoiceStatus,
  getShipmentStatus,
  isInventoryDanger,
} from "@/utils/operations";

const SHOPIFY_DASHBOARD_SYNC_FUNCTION = "shopify-dashboard-sync";

function normalizeChannelName(channel: string | null | undefined) {
  const value = (channel ?? "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("shopify") || value.includes("dtc")) return "DTC + Shopify";
  return channel?.trim() ?? "";
}

function endOfWindow(start: string | null, end: string | null) {
  if (start && end) return `${start} to ${end}`;
  if (start) return `Starts ${start}`;
  if (end) return `Ends ${end}`;
  return "Window not set";
}

export const dashboardService = {
  async syncShopifyDashboard() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.functions.invoke(SHOPIFY_DASHBOARD_SYNC_FUNCTION, {
      body: { mode: "year" },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "Shopify dashboard sync failed.");
    return data as {
      ok: true;
      lookbackDays: number;
      matchedOrders: number;
      ordersSynced: number;
      lineItemsSynced: number;
    };
  },

  async getSnapshot(): Promise<DashboardSnapshot> {
    const supabase = assertSupabase();
    const [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      activityResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*"),
      supabase.from("products").select("*"),
      supabase.from("alerts").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
      supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("po_line_items").select("*"),
      supabase.from("inventory_items").select("*"),
    ]);

    [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      activityResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const rawProducts = (productsResponse.data ?? []) as Product[];
    const alerts = (alertsResponse.data ?? []) as Alert[];
    const activity = (activityResponse.data ?? []) as ActivityEvent[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const retailers = (retailersResponse.data ?? []) as Retailer[];
    const events = (eventsResponse.data ?? []) as InventoryEvent[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];
    const inventoryItems = (inventoryItemsResponse.data ?? []) as InventoryItem[];
    const products = applyCalculatedSafetyStock(rawProducts, vendors, events);

    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const eventsByProductId = new Map<string, InventoryEvent[]>();
    events.forEach((event) => {
      if (!event.product_id) return;
      const current = eventsByProductId.get(event.product_id) ?? [];
      current.push(event);
      eventsByProductId.set(event.product_id, current);
    });
    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    const manufacturerOrders = purchaseOrders.filter((po) => po.po_type === "Manufacturer PO");
    const retailerOrders = purchaseOrders.filter((po) => po.po_type === "Retailer PO");
    const activeManufacturerOrders = manufacturerOrders.filter((po) => !["Received", "Closed", "Cancelled"].includes(po.status));
    const wholesaleOrders = retailerOrders.filter((po) => normalizeChannelName(po.source_channel) !== "DTC + Shopify" && po.status !== "Cancelled");

    const currentYearStart = `${new Date().getFullYear()}-01-01`;
    const wholesaleOrdersYtd = wholesaleOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? po.created_at.slice(0, 10);
      return effectiveDate >= currentYearStart;
    });
    const getWholesaleRevenue = (po: PurchaseOrder) =>
      (lineItemsByPo.get(po.id) ?? []).reduce((sum, item) => {
        const product = item.product_id ? productById.get(item.product_id) : null;
        const price = Number(product?.unit_price ?? 0) > 0 ? Number(product?.unit_price ?? 0) : Number(item.unit_cost ?? 0);
        return sum + price * Number(item.quantity_ordered ?? 0);
      }, 0);
    const wholesaleRevenueTotal = wholesaleOrdersYtd.reduce((sum, po) => sum + getWholesaleRevenue(po), 0);

    const incomingByProduct = new Map<string, number>();
    products.forEach((product) => {
      incomingByProduct.set(product.id, getIncomingQuantityForProduct(product.id, activeManufacturerOrders, lineItemsByPo));
    });

    const skuReorderWindows = products
      .map((product) => {
        const incomingQuantity = incomingByProduct.get(product.id) ?? 0;
        const reorderWindow = buildSkuReorderWindow({
          product,
          vendor: vendorById.get(product.vendor_id ?? ""),
          events: eventsByProductId.get(product.id) ?? [],
          incomingQuantity,
        });
        return {
          sku: product.sku,
          productName: product.name,
          recommendation: reorderWindow.recommendation,
          reorderByDate: reorderWindow.reorderByDate,
          currentQuantity: product.current_inventory,
          incomingQuantity,
        };
      })
      .sort((left, right) => left.currentQuantity - right.currentQuantity);

    const inventoryAlerts = products
      .map((product) => ({
        sku: product.sku,
        productName: product.name,
        currentQuantity: product.current_inventory,
        incomingQuantity: incomingByProduct.get(product.id) ?? 0,
        status: getInventoryHealthTone(product.current_inventory, product.safety_stock),
      }))
      .filter((item) => item.status !== "healthy" || item.incomingQuantity > 0)
      .sort((left, right) => left.currentQuantity - right.currentQuantity)
      .slice(0, 8);

    const dangerProducts = products.filter((product) => isInventoryDanger(product.current_inventory));
    const openInvoices = activeManufacturerOrders.filter((po) => getInvoiceStatus(po) === "Open");
    const shippedInvoices = activeManufacturerOrders.filter((po) => getInvoiceStatus(po) === "Shipped");
    const inventoryInRoute = activeManufacturerOrders.filter((po) => ["In Route", "Inventory in Route"].includes(getInvoiceStatus(po)));

    const manufacturingSnapshotRows = activeManufacturerOrders
      .map((po) => {
        const poLineItems = lineItemsByPo.get(po.id) ?? [];
        const incomingUnits = poLineItems.reduce((sum, item) => sum + Math.max(Number(item.quantity_ordered ?? 0) - Number(item.quantity_received ?? 0), 0), 0);
        const uniqueSkuCount = new Set(poLineItems.map((item) => item.sku)).size;
        const reorderWindowSummary = poLineItems
          .slice(0, 2)
          .map((item) => {
            const product = item.product_id ? productById.get(item.product_id) : null;
            if (!product) return item.sku;
            const entry = skuReorderWindows.find((window) => window.sku === product.sku);
            return entry ? `${entry.sku}: ${entry.recommendation}` : item.sku;
          })
          .join(" | ");

        return {
          poId: po.id,
          poNumber: po.po_number,
          manufacturer: vendorById.get(po.vendor_id ?? "")?.name ?? "Unassigned",
          invoiceStatus: getInvoiceStatus(po),
          shipmentStatus: getShipmentStatus(po),
          etaDate: po.eta_date ?? po.expected_delivery_date,
          shipDate: po.ship_date,
          skuCount: uniqueSkuCount,
          incomingUnits,
          reorderWindowSummary: reorderWindowSummary || "No reorder recommendation yet",
        };
      })
      .sort((left, right) => (left.etaDate ?? "9999-12-31").localeCompare(right.etaDate ?? "9999-12-31"));

    const activeSkusInRoute = new Set(
      inventoryInRoute.flatMap((po) => (lineItemsByPo.get(po.id) ?? []).map((item) => item.sku)),
    ).size;

    const wholesaleAccounts = retailers
      .map((retailer) => {
        const accountOrders = wholesaleOrders.filter((po) => po.retailer_id === retailer.id);
        return {
          retailerId: retailer.id,
          retailer: retailer.name,
          openInvoices: accountOrders.filter((po) => getInvoiceStatus(po) === "Open").length,
          shippedInvoices: accountOrders.filter((po) => ["Shipped", "In Route", "Inventory in Route"].includes(getInvoiceStatus(po))).length,
          recentPoCount: accountOrders.slice(0, 90).length,
          nextWindow: endOfWindow(retailer.next_reorder_start, retailer.next_reorder_end),
        };
      })
      .filter((item) => item.openInvoices > 0 || item.shippedInvoices > 0 || item.recentPoCount > 0)
      .slice(0, 8);

    const priorityFeed: DashboardSnapshot["priorityFeed"] = [
      ...dangerProducts.slice(0, 3).map((product) => ({
        id: `danger-${product.id}`,
        title: `${product.name} is in danger`,
        detail: `${product.current_inventory} units on hand. Incoming: ${incomingByProduct.get(product.id) ?? 0}`,
        severity: "danger" as const,
        actionLabel: "Reorder immediately",
      })),
      ...openInvoices.slice(0, 2).map((po) => ({
        id: `open-${po.id}`,
        title: `Open invoice ${po.po_number}`,
        detail: `${vendorById.get(po.vendor_id ?? "")?.name ?? "Manufacturer"} has not shipped yet.`,
        severity: "warning" as const,
        actionLabel: "Follow up on shipment timing",
      })),
      ...wholesaleAccounts.slice(0, 2).map((account) => ({
        id: `account-${account.retailerId}`,
        title: `${account.retailer} reorder window`,
        detail: account.nextWindow,
        severity: "info" as const,
        actionLabel: "Review account profile",
      })),
    ];

    const productionTimelineRows = getProductionTimelineRows(manufacturerOrders);
    const avgOrderToArrivalDays = getAverageTimelineDays(productionTimelineRows, "orderToArrivalDays");
    const avgPaidToArrivalDays = getAverageTimelineDays(productionTimelineRows, "paidToArrivalDays");
    const productionTimelineExceptionCount = getProductionTimelineExceptionCount(productionTimelineRows);
    const productionTimelineTrend = getProductionTimelineTrend(productionTimelineRows);

    return {
      openPoCount: purchaseOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status)).length,
      delayedPoCount: purchaseOrders.filter((po) => po.status === "Delayed").length,
      lowStockCount: products.filter((product) => product.current_inventory <= product.safety_stock).length,
      projectedStockoutCount: 0,
      vendorRiskCount: 0,
      inventoryValue: products.reduce((sum, product) => sum + Number(product.current_inventory ?? 0) * Number(product.unit_cost ?? 0), 0),
      weightedForecastValue: 0,
      activePipelineValue: 0,
      dueIn14DaysCount: 0,
      pendingIntakeCount: purchaseOrders.filter((po) => po.status === "Pending").length,
      avgOrderToArrivalDays,
      avgPaidToArrivalDays,
      productionTimelineExceptionCount,
      productionTimelineTrend,
      recentImports: [] as CsvImport[],
      recentAlerts: alerts,
      recentActivity: activity,
      quickSops: [] as Sop[],
      stockTrend: inventoryItems.slice(0, 8).map((item) => ({
        date: item.updated_at.slice(0, 10),
        inventory: item.quantity_on_hand,
      })),
      spendByVendor: vendors
        .map((vendor) => ({
          vendor: vendor.name,
          spend: purchaseOrders.filter((po) => po.vendor_id === vendor.id).reduce((sum, po) => sum + Number(po.total_cost ?? 0), 0),
        }))
        .filter((entry) => entry.spend > 0)
        .slice(0, 6),
      revenueYtd: wholesaleRevenueTotal,
      revenueYtdDeltaPercent: 0,
      activeWholesalePipelineValue: 0,
      activeWholesalePipelineCount: wholesaleOrders.length,
      awaitingActionCount: openInvoices.length + dangerProducts.length,
      awaitingPoSubmissionCount: purchaseOrders.filter((po) => po.status === "Draft").length,
      skuOosRisk90dCount: skuReorderWindows.filter((item) => item.recommendation !== "Monitor window").length,
      skuOosRiskCriticalCount: dangerProducts.length,
      productionPosInFlightCount: activeManufacturerOrders.length,
      productionNextLandDate: manufacturingSnapshotRows[0]?.etaDate ?? null,
      dtcOrdersTodayCount: 0,
      dtcOrdersTodayValue: 0,
      priorRevenueYtd: 0,
      projectedRevenueYearEnd: wholesaleRevenueTotal,
      revenuePaceDeltaPercent: 0,
      revenueByChannelYtd: wholesaleAccounts.map((account) => ({
        channel: account.retailer,
        value: wholesaleOrdersYtd
          .filter((po) => po.retailer_id === account.retailerId)
          .reduce((sum, po) => sum + getWholesaleRevenue(po), 0),
      })),
      topSkusYtd: skuReorderWindows.slice(0, 6).map((item) => ({
        sku: item.sku,
        label: item.productName,
        value: 0,
        units: item.currentQuantity + item.incomingQuantity,
      })),
      revenueProjectionTrend: Array.from({ length: 12 }, (_, index) => ({
        label: new Date(new Date().getFullYear(), index, 1).toLocaleString("en-US", { month: "short" }),
        actualRevenue: index <= new Date().getMonth() ? wholesaleRevenueTotal : null,
        projectedRevenue: wholesaleRevenueTotal,
        priorBaselineRevenue: 0,
      })),
      priorityFeed,
      pipelineByRetailer: [],
      reorderWindows: wholesaleAccounts.map((account) => ({
        retailer: account.retailer,
        window: account.nextWindow,
        productHint: "Use SKU reorder windows below to decide next PO timing.",
      })),
      wholesaleRevenueTotal,
      dangerSkuCount: dangerProducts.length,
      incomingInventoryUnits: [...incomingByProduct.values()].reduce((sum, value) => sum + value, 0),
      openInvoiceCount: openInvoices.length,
      shippedInvoiceCount: shippedInvoices.length,
      inventoryInRouteCount: inventoryInRoute.length,
      activeSkusInRoute,
      manufacturingSnapshotRows,
      wholesaleAccounts,
      inventoryAlerts,
      skuReorderWindows,
    };
  },
};
