import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { insertTable, listTable, updateTable } from "@/services/baseService";
import type { Alert, InventoryEvent, Product, PurchaseOrder, Vendor } from "@/types/domain";
import { calculateForecastMetric, calculateVendorDelay } from "@/utils/forecasting";

export const alertService = {
  list: () => listTable<Alert>("alerts"),
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
          severity: "High",
          message: `${product.name} is below safety stock.`,
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
