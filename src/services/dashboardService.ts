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
  Sop,
  Vendor,
} from "@/types/domain";
import { calculateVendorReliability } from "@/utils/forecasting";
import { daysBetween } from "@/utils/date";

function endOfWindow(start: string | null, end: string | null) {
  if (start && end) return `${start} to ${end}`;
  return "Window not set";
}

export const dashboardService = {
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
    const products = applyCalculatedSafetyStock(rawProducts, vendors, events);

    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    const vendorRiskCount = vendors.filter((vendor) => {
      const vendorPos = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
      return calculateVendorReliability(vendor, vendorPos, lineItemsByPo) < 65;
    }).length;

    const openOrders = purchaseOrders.filter((po) => !["Closed", "Received", "Cancelled"].includes(po.status));
    const manufacturerOrders = purchaseOrders.filter((po) => po.po_type === "Manufacturer PO");
    const retailerOrders = purchaseOrders.filter((po) => po.po_type === "Retailer PO");
    const pendingIntakeCount = purchaseOrders.filter((po) => po.status === "Pending").length;
    const dueIn14DaysCount = purchaseOrders.filter((po) => {
      if (!po.expected_delivery_date) return false;
      const delta = daysBetween(new Date().toISOString().slice(0, 10), po.expected_delivery_date);
      return delta >= 0 && delta <= 14;
    }).length;

    const lowStockProducts = products
      .filter((product) => product.current_inventory <= product.safety_stock)
      .sort((left, right) => left.current_inventory - right.current_inventory);
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

    const paidToDeliveredOrders = manufacturerOrders.filter((po) => po.invoice_paid_at && po.actual_delivery_date);
    const avgPaidToDeliveredDays = paidToDeliveredOrders.length
      ? Math.round(
          paidToDeliveredOrders.reduce(
            (sum, po) => sum + daysBetween(po.invoice_paid_at, po.actual_delivery_date),
            0,
          ) / paidToDeliveredOrders.length,
        )
      : 0;

    const pipelineByRetailer = retailers
      .map((retailer) => ({
        retailer: retailer.name,
        value: retailerOrders
          .filter((po) => po.retailer_id === retailer.id && !["Received", "Closed", "Cancelled"].includes(po.status))
          .reduce((sum, po) => sum + po.total_cost, 0),
      }))
      .filter((item) => item.value > 0)
      .slice(0, 6);

    const leadTimeTrend = manufacturerOrders
      .filter((po) => po.invoice_paid_at || po.order_date)
      .slice(0, 8)
      .map((po) => ({
        label: po.po_number,
        days: po.actual_delivery_date
          ? daysBetween(po.invoice_paid_at ?? po.order_date, po.actual_delivery_date)
          : daysBetween(po.invoice_paid_at ?? po.order_date, new Date().toISOString().slice(0, 10)),
      }));

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

    return {
      openPoCount: openOrders.length,
      delayedPoCount: purchaseOrders.filter((po) => po.status === "Delayed").length,
      lowStockCount: products.filter((product) => product.current_inventory <= product.safety_stock).length,
      projectedStockoutCount: alerts.filter((alert) => alert.alert_type === "Projected Stockout").length,
      vendorRiskCount,
      inventoryValue: products.reduce((sum, product) => sum + product.current_inventory * product.unit_cost, 0),
      weightedForecastValue: retailerOrders.reduce((sum, po) => sum + po.total_cost * 0.65, 0),
      activePipelineValue: openOrders.reduce((sum, po) => sum + po.total_cost, 0),
      dueIn14DaysCount,
      pendingIntakeCount,
      avgPaidToDeliveredDays,
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
      leadTimeTrend,
      reorderWindows,
    };
  },
};
