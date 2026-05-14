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
import { calculateForecastMetric, calculateVendorReliability } from "@/utils/forecasting";
import {
  getAverageTimelineDays,
  getProductionTimelineExceptionCount,
  getProductionTimelineRows,
  getProductionTimelineTrend,
} from "@/utils/productionTimeline";
import { daysBetween } from "@/utils/date";

const SHOPIFY_DASHBOARD_SYNC_FUNCTION = "shopify-dashboard-sync";

function endOfWindow(start: string | null, end: string | null) {
  if (start && end) return `${start} to ${end}`;
  return "Window not set";
}

function normalizeChannelName(channel: string | null | undefined) {
  const value = (channel ?? "").trim().toLowerCase();
  if (!value) return "";
  if (value.includes("shopify") || value.includes("dtc")) return "DTC + Shopify";
  return channel?.trim() ?? "";
}

function getMonthLabel(index: number) {
  return new Date(2026, index, 1).toLocaleString("en-US", { month: "short" });
}

export const dashboardService = {
  async syncShopifyDashboard() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.functions.invoke(SHOPIFY_DASHBOARD_SYNC_FUNCTION, {
      body: {
        mode: "year",
      },
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
      importsResponse,
      activityResponse,
      sopsResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
      settingsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*"),
      supabase.from("products").select("*"),
      supabase.from("alerts").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
      supabase.from("csv_imports").select("*, vendors(*)").order("created_at", { ascending: false }).limit(5),
      supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("sops").select("*").order("is_favorite", { ascending: false }).order("updated_at", { ascending: false }).limit(5),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("po_line_items").select("*"),
      supabase.from("inventory_items").select("*"),
      supabase.from("shopify_orders").select("*"),
      supabase.from("shopify_order_line_items").select("*"),
      supabase
        .from("app_settings")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      importsResponse,
      activityResponse,
      sopsResponse,
      vendorsResponse,
      retailersResponse,
      eventsResponse,
      lineItemsResponse,
      inventoryItemsResponse,
      shopifyOrdersResponse,
      shopifyOrderLineItemsResponse,
      settingsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const rawProducts = (productsResponse.data ?? []) as Product[];
    const alerts = (alertsResponse.data ?? []) as Alert[];
    const imports = (importsResponse.data ?? []) as CsvImport[];
    const activity = (activityResponse.data ?? []) as ActivityEvent[];
    const sops = (sopsResponse.data ?? []) as Sop[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const retailers = (retailersResponse.data ?? []) as Retailer[];
    const events = (eventsResponse.data ?? []) as InventoryEvent[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];
    const inventoryItems = (inventoryItemsResponse.data ?? []) as InventoryItem[];
    const shopifyOrders = (shopifyOrdersResponse.data ?? []) as ShopifyOrder[];
    const shopifyOrderLineItems = (shopifyOrderLineItemsResponse.data ?? []) as ShopifyOrderLineItem[];
    const settings = settingsResponse.data;
    const products = applyCalculatedSafetyStock(rawProducts, vendors, events);

    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    const productById = new Map(products.map((product) => [product.id, product]));
    const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const retailerById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
    const eventsByProductId = new Map<string, InventoryEvent[]>();
    events.forEach((event) => {
      if (!event.product_id) return;
      const current = eventsByProductId.get(event.product_id) ?? [];
      current.push(event);
      eventsByProductId.set(event.product_id, current);
    });

    const vendorRiskCount = vendors.filter((vendor) => {
      const vendorPos = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
      return calculateVendorReliability(vendor, vendorPos, lineItemsByPo) < 65;
    }).length;

    const openOrders = purchaseOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const manufacturerOrders = purchaseOrders.filter((po) => po.po_type === "Manufacturer PO");
    const retailerOrders = purchaseOrders.filter((po) => po.po_type === "Retailer PO");
    const openManufacturerOrders = manufacturerOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const openRetailerOrders = retailerOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const activeWholesalePipelineOrders = openRetailerOrders.filter(
      (po) => normalizeChannelName(po.source_channel) !== "DTC + Shopify",
    );
    const pendingIntakeCount = purchaseOrders.filter((po) => po.status === "Pending").length;
    const dueIn14DaysCount = purchaseOrders.filter((po) => {
      if (!po.expected_delivery_date) return false;
      const delta = daysBetween(new Date().toISOString().slice(0, 10), po.expected_delivery_date);
      return delta >= 0 && delta <= 14;
    }).length;

    const lowStockProducts = products
      .filter((product) => product.current_inventory <= product.safety_stock)
      .sort((left, right) => left.current_inventory - right.current_inventory);
    const riskyProducts90d = products
      .map((product) => {
        const vendorLeadTimeDays = vendorById.get(product.vendor_id ?? "")?.lead_time_days ?? 0;
        const forecast = calculateForecastMetric(
          product,
          eventsByProductId.get(product.id) ?? [],
          vendorLeadTimeDays,
        );
        return { product, forecast };
      })
      .filter(({ forecast }) => forecast.projectedDaysRemaining !== null && forecast.projectedDaysRemaining <= 90);
    const atRiskManufacturerPo = manufacturerOrders.find(
      (po) => po.invoice_paid_at && !po.tracking_number && !["Received", "Closed"].includes(po.status),
    );

    const priorityFeed: DashboardSnapshot["priorityFeed"] = [
      ...lowStockProducts.slice(0, 3).map((product) => ({
        id: `product-${product.id}`,
        title: `${product.name} needs reorder attention`,
        detail: `${product.current_inventory} on hand against ${product.safety_stock} safety stock`,
        severity: "danger" as const,
        actionLabel: "Review SKU",
      })),
      ...(atRiskManufacturerPo
        ? [
            {
              id: `po-${atRiskManufacturerPo.id}`,
              title: `PO ${atRiskManufacturerPo.po_number} is paid with no tracking`,
              detail: `Invoice paid ${atRiskManufacturerPo.invoice_paid_at}; follow up with manufacturer`,
              severity: "warning" as const,
              actionLabel: "Message vendor",
            },
          ]
        : []),
      ...retailers
        .filter((retailer) => retailer.next_reorder_start)
        .slice(0, 2)
        .map((retailer) => ({
          id: `retailer-${retailer.id}`,
          title: `${retailer.name} reorder window is approaching`,
          detail: endOfWindow(retailer.next_reorder_start, retailer.next_reorder_end),
          severity: "info" as const,
          actionLabel: "Draft PO",
        })),
    ];

    const productionTimelineRows = getProductionTimelineRows(manufacturerOrders);
    const avgOrderToArrivalDays = getAverageTimelineDays(productionTimelineRows, "orderToArrivalDays");
    const avgPaidToArrivalDays = getAverageTimelineDays(productionTimelineRows, "paidToArrivalDays");
    const productionTimelineExceptionCount = getProductionTimelineExceptionCount(productionTimelineRows);
    const productionTimelineTrend = getProductionTimelineTrend(productionTimelineRows);

    const pipelineByRetailer = retailers
      .map((retailer) => ({
        retailer: retailer.name,
        value: retailerOrders
          .filter((po) => po.retailer_id === retailer.id && !["Received", "Closed", "Cancelled"].includes(po.status))
          .reduce((sum, po) => sum + po.total_cost, 0),
      }))
      .filter((item) => item.value > 0)
      .slice(0, 6);

    const reorderWindows = retailers
      .filter((retailer) => retailer.next_reorder_start || retailer.next_reorder_end)
      .slice(0, 5)
      .map((retailer) => ({
        retailer: retailer.name,
        window: endOfWindow(retailer.next_reorder_start, retailer.next_reorder_end),
        productHint:
          retailerOrders.find((po) => po.retailer_id === retailer.id)?.notes ??
          "Use recent top-selling SKU mix",
      }));

    const today = new Date().toISOString().slice(0, 10);
    const currentYearStart = `${new Date().getFullYear()}-01-01`;
    const retailerOrdersYtd = retailerOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? po.created_at.slice(0, 10);
      return effectiveDate >= currentYearStart && po.status !== "Cancelled";
    });
    const priorYearStart = `${new Date().getFullYear() - 1}-01-01`;
    const priorYearCutoff = `${new Date().getFullYear() - 1}-${today.slice(5)}`;
    const retailerOrdersPriorYtd = retailerOrders.filter((po) => {
      const effectiveDate = po.submitted_at ?? po.order_date ?? po.created_at.slice(0, 10);
      return effectiveDate >= priorYearStart && effectiveDate <= priorYearCutoff && po.status !== "Cancelled";
    });

    const getRetailRevenue = (po: PurchaseOrder) =>
      (lineItemsByPo.get(po.id) ?? []).reduce((sum, item) => {
        const product = item.product_id ? productById.get(item.product_id) : undefined;
        const unitPrice = product?.unit_price ?? 0;
        return sum + unitPrice * item.quantity_ordered;
      }, 0);

    const shopifyOrderById = new Map(shopifyOrders.map((order) => [order.id, order]));
    const shopifyOrdersYtd = shopifyOrders.filter(
      (order) => !order.cancelled_at && order.order_created_at.slice(0, 10) >= currentYearStart,
    );
    const shopifyOrdersPriorYtd = shopifyOrders.filter((order) => {
      const orderDate = order.order_created_at.slice(0, 10);
      return !order.cancelled_at && orderDate >= priorYearStart && orderDate <= priorYearCutoff;
    });
    const shopifyRevenueYtd = shopifyOrdersYtd.reduce((sum, order) => sum + order.current_total_price, 0);
    const shopifyRevenuePriorYtd = shopifyOrdersPriorYtd.reduce((sum, order) => sum + order.current_total_price, 0);

    const revenueYtd = retailerOrdersYtd.reduce((sum, po) => sum + getRetailRevenue(po), 0) + shopifyRevenueYtd;
    const derivedPriorRevenueYtd = retailerOrdersPriorYtd.reduce((sum, po) => sum + getRetailRevenue(po), 0) + shopifyRevenuePriorYtd;
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const elapsedDays = Math.max(
      Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1,
      1,
    );
    const totalDaysInYear = Math.floor((endOfYear.getTime() - startOfYear.getTime()) / 86400000) + 1;
    const priorRevenueYtd = Number(settings?.prior_ytd_revenue ?? derivedPriorRevenueYtd ?? 0);
    const priorRevenuePaceToDate =
      priorRevenueYtd > 0 ? (priorRevenueYtd / totalDaysInYear) * elapsedDays : 0;
    const revenueYtdDeltaPercent =
      priorRevenuePaceToDate > 0
        ? Math.round(((revenueYtd - priorRevenuePaceToDate) / priorRevenuePaceToDate) * 100)
        : 0;
    const projectedRevenueYearEnd = revenueYtd > 0 ? Math.round((revenueYtd / elapsedDays) * totalDaysInYear) : 0;
    const revenuePaceDeltaPercent =
      priorRevenuePaceToDate > 0
        ? Math.round(((revenueYtd - priorRevenuePaceToDate) / priorRevenuePaceToDate) * 100)
        : 0;

    const defaultChannels = [
      "DTC + Shopify",
      "CVS Health",
      "Navy Exchange",
      "Paradies Lagardere",
      "Scheels",
      "Dallas Wings",
      "Fundraisers",
    ];
    const revenueByChannelMap = new Map<string, number>(defaultChannels.map((channel) => [channel, 0]));
    retailerOrdersYtd.forEach((po) => {
      const normalizedSource = normalizeChannelName(po.source_channel);
      const retailerName = retailerById.get(po.retailer_id ?? "")?.name ?? "";
      const channel = normalizedSource || retailerName;
      if (!channel) return;
      revenueByChannelMap.set(channel, (revenueByChannelMap.get(channel) ?? 0) + getRetailRevenue(po));
    });
    revenueByChannelMap.set("DTC + Shopify", (revenueByChannelMap.get("DTC + Shopify") ?? 0) + shopifyRevenueYtd);
    const revenueByChannelYtd = [...revenueByChannelMap.entries()]
      .map(([channel, value]) => ({ channel, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 7);

    const topSkusMap = new Map<string, { sku: string; label: string; value: number; units: number }>();
    retailerOrdersYtd.forEach((po) => {
      (lineItemsByPo.get(po.id) ?? []).forEach((item) => {
        const product = item.product_id ? productById.get(item.product_id) : undefined;
        const unitPrice = product?.unit_price ?? 0;
        const key = item.sku || item.product_name;
        const current = topSkusMap.get(key) ?? {
          sku: item.sku,
          label: item.product_name,
          value: 0,
          units: 0,
        };
        current.value += unitPrice * item.quantity_ordered;
        current.units += item.quantity_ordered;
        topSkusMap.set(key, current);
      });
    });
    shopifyOrderLineItems.forEach((item) => {
      const order = shopifyOrderById.get(item.shopify_order_record_id);
      if (!order || order.cancelled_at || order.order_created_at.slice(0, 10) < currentYearStart) return;
      const key = item.sku ?? item.title;
      const current = topSkusMap.get(key) ?? {
        sku: item.sku ?? "",
        label: item.title,
        value: 0,
        units: 0,
      };
      current.value += item.line_total;
      current.units += item.quantity;
      topSkusMap.set(key, current);
    });
    const topSkusYtd = [...topSkusMap.values()]
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);

    const dtcOrdersToday = shopifyOrders.filter(
      (order) => !order.cancelled_at && order.order_created_at.slice(0, 10) === today,
    );
    const dtcOrdersTodayValue = dtcOrdersToday.reduce((sum, order) => sum + order.current_total_price, 0);

    const futureManufacturerOrders = openManufacturerOrders
      .filter((po) => po.expected_delivery_date && po.expected_delivery_date >= today)
      .sort((left, right) => (left.expected_delivery_date ?? "").localeCompare(right.expected_delivery_date ?? ""));
    const productionNextLandDate = futureManufacturerOrders[0]?.expected_delivery_date ?? null;

    const revenueEvents = [
      ...retailerOrdersYtd.map((po) => ({
        date: po.submitted_at ?? po.order_date ?? po.created_at,
        value: getRetailRevenue(po),
      })),
      ...shopifyOrdersYtd.map((order) => ({
        date: order.order_created_at,
        value: order.current_total_price,
      })),
    ];

    const actualRevenueByMonth = Array.from({ length: 12 }, (_, index) => {
      const monthEnd = new Date(now.getFullYear(), index + 1, 0);
      if (monthEnd > now) return null;
      return revenueEvents
        .filter((entry) => {
          const entryDate = new Date(entry.date);
          return entryDate.getMonth() <= index;
        })
        .reduce((sum, entry) => sum + entry.value, 0);
    });

    const revenueProjectionTrend = Array.from({ length: 12 }, (_, index) => {
      const monthEnd = new Date(now.getFullYear(), index + 1, 0);
      const daysIntoMonthTarget = Math.min(
        Math.floor((monthEnd.getTime() - startOfYear.getTime()) / 86400000) + 1,
        totalDaysInYear,
      );
      const actualRevenue = actualRevenueByMonth[index];
      const projectedRevenue = revenueYtd > 0 ? Math.round((revenueYtd / elapsedDays) * daysIntoMonthTarget) : 0;
      const priorBaselineRevenue =
        priorRevenueYtd > 0
          ? Math.round((priorRevenueYtd / totalDaysInYear) * daysIntoMonthTarget)
          : 0;

      return {
        label: getMonthLabel(index),
        actualRevenue,
        projectedRevenue,
        priorBaselineRevenue,
      };
    });

    return {
      openPoCount: openOrders.length,
      delayedPoCount: purchaseOrders.filter((po) => po.status === "Delayed").length,
      lowStockCount: products.filter((product) => product.current_inventory <= product.safety_stock).length,
      projectedStockoutCount: alerts.filter((alert) => alert.alert_type === "Projected Stockout").length,
      vendorRiskCount,
      inventoryValue: products.reduce((sum, product) => sum + product.current_inventory * product.unit_cost, 0),
      weightedForecastValue: retailerOrders.reduce((sum, po) => sum + po.total_cost * 0.65, 0),
      activePipelineValue: openOrders.reduce((sum, po) => sum + po.total_cost, 0),
      revenueYtd,
      revenueYtdDeltaPercent,
      activeWholesalePipelineValue: activeWholesalePipelineOrders.reduce((sum, po) => sum + po.total_cost, 0),
      activeWholesalePipelineCount: activeWholesalePipelineOrders.length,
      awaitingActionCount: purchaseOrders.filter((po) => ["Pending", "Delayed", "Issue Flagged", "Draft"].includes(po.status)).length,
      awaitingPoSubmissionCount: purchaseOrders.filter((po) => po.status === "Draft").length,
      skuOosRisk90dCount: riskyProducts90d.length,
      skuOosRiskCriticalCount: riskyProducts90d.filter(({ forecast }) => (forecast.projectedDaysRemaining ?? Infinity) <= 30).length,
      productionPosInFlightCount: openManufacturerOrders.length,
      productionNextLandDate,
      dtcOrdersTodayCount: dtcOrdersToday.length,
      dtcOrdersTodayValue,
      priorRevenueYtd,
      projectedRevenueYearEnd,
      revenuePaceDeltaPercent,
      revenueByChannelYtd,
      topSkusYtd,
      revenueProjectionTrend,
      dueIn14DaysCount,
      pendingIntakeCount,
      avgOrderToArrivalDays,
      avgPaidToArrivalDays,
      productionTimelineExceptionCount,
      productionTimelineTrend,
      recentImports: imports,
      recentAlerts: alerts,
      recentActivity: activity,
      quickSops: sops,
      stockTrend: inventoryItems.slice(0, 8).map((item) => ({
        date: item.id.slice(0, 8),
        inventory: item.quantity_on_hand,
      })),
      spendByVendor: purchaseOrders
        .reduce<Array<{ vendor: string; spend: number }>>((acc, po) => {
          const vendorName = vendors.find((vendor) => vendor.id === po.vendor_id)?.name ?? "Unassigned";
          const current = acc.find((entry) => entry.vendor === vendorName);
          if (current) current.spend += po.total_cost;
          else acc.push({ vendor: vendorName, spend: po.total_cost });
          return acc;
        }, [])
        .slice(0, 6),
      priorityFeed,
      pipelineByRetailer,
      reorderWindows,
    };
  },
};
