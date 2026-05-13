import { assertSupabase } from "@/lib/supabase";
import type {
  ActivityEvent,
  Alert,
  CsvImport,
  DashboardSnapshot,
  PoLineItem,
  Product,
  PurchaseOrder,
  Sop,
  Vendor,
} from "@/types/domain";
import { calculateVendorReliability } from "@/utils/forecasting";

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
      lineItemsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*, vendors(*), locations(*)"),
      supabase.from("products").select("*"),
      supabase.from("alerts").select("*").eq("is_resolved", false).order("created_at", { ascending: false }).limit(6),
      supabase.from("csv_imports").select("*, vendors(*)").order("created_at", { ascending: false }).limit(5),
      supabase.from("activity_events").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("sops").select("*").order("is_favorite", { ascending: false }).order("updated_at", { ascending: false }).limit(5),
      supabase.from("vendors").select("*"),
      supabase.from("po_line_items").select("*"),
    ]);

    [
      purchaseOrdersResponse,
      productsResponse,
      alertsResponse,
      importsResponse,
      activityResponse,
      sopsResponse,
      vendorsResponse,
      lineItemsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const products = (productsResponse.data ?? []) as Product[];
    const alerts = (alertsResponse.data ?? []) as Alert[];
    const imports = (importsResponse.data ?? []) as CsvImport[];
    const activity = (activityResponse.data ?? []) as ActivityEvent[];
    const sops = (sopsResponse.data ?? []) as Sop[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];

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

    return {
      openPoCount: purchaseOrders.filter((po) => !["Closed", "Received"].includes(po.status)).length,
      delayedPoCount: purchaseOrders.filter((po) => po.status === "Delayed").length,
      lowStockCount: products.filter((product) => product.current_inventory <= product.safety_stock).length,
      projectedStockoutCount: alerts.filter((alert) => alert.alert_type === "Projected Stockout").length,
      vendorRiskCount,
      inventoryValue: products.reduce((sum, product) => sum + product.current_inventory * product.unit_cost, 0),
      recentImports: imports,
      recentAlerts: alerts,
      recentActivity: activity,
      quickSops: sops,
      stockTrend: products.slice(0, 8).map((product) => ({
        date: product.sku,
        inventory: product.current_inventory,
      })),
      spendByVendor: purchaseOrders.reduce<Array<{ vendor: string; spend: number }>>((acc, po) => {
        const vendorName = po.vendors?.name ?? "Unassigned";
        const current = acc.find((entry) => entry.vendor === vendorName);
        if (current) current.spend += po.total_cost;
        else acc.push({ vendor: vendorName, spend: po.total_cost });
        return acc;
      }, []).slice(0, 6),
    };
  },
};
