import { assertSupabase } from "@/lib/supabase";
import { listTable, upsertTable, deleteFromTable } from "@/services/baseService";
import type { PoLineItem, PurchaseOrder, Vendor } from "@/types/domain";
import { calculateVendorDelay, calculateVendorReliability, calculateFillRate } from "@/utils/forecasting";

export const vendorService = {
  list: () => listTable<Vendor>("vendors", "name", true),
  upsert: async (payload: Partial<Vendor>) => {
    const [saved] = (await upsertTable<Vendor>("vendors", payload)) as Vendor[];
    return saved;
  },
  remove: (id: string) => deleteFromTable("vendors", id),
  async getScorecards() {
    const supabase = assertSupabase();
    const [vendorsResponse, posResponse, lineItemsResponse] = await Promise.all([
      supabase.from("vendors").select("*").order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*"),
      supabase.from("po_line_items").select("*"),
    ]);
    if (vendorsResponse.error) throw vendorsResponse.error;
    if (posResponse.error) throw posResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const purchaseOrders = (posResponse.data ?? []) as PurchaseOrder[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];

    const spendTotal = purchaseOrders.reduce((sum, po) => sum + po.total_cost, 0);
    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    return vendors.map((vendor) => {
      const vendorPos = purchaseOrders.filter((po) => po.vendor_id === vendor.id);
      const spend = vendorPos.reduce((sum, po) => sum + po.total_cost, 0);
      const averageDelay =
        vendorPos.length > 0
          ? vendorPos.reduce((sum, po) => sum + Math.max(calculateVendorDelay(po), 0), 0) / vendorPos.length
          : 0;
      const lateRate =
        vendorPos.length > 0
          ? vendorPos.filter((po) => calculateVendorDelay(po) > 0).length / vendorPos.length
          : 0;
      const fillRate =
        vendorPos.length > 0
          ? vendorPos.reduce((sum, po) => sum + calculateFillRate(lineItemsByPo.get(po.id) ?? []), 0) / vendorPos.length
          : 0;

      return {
        ...vendor,
        lead_time_days: vendor.lead_time_days ?? 0,
        totalPos: vendorPos.length,
        totalSpend: spend,
        averageDeliveryDelay: averageDelay,
        latePoPercentage: lateRate * 100,
        fillRate: fillRate * 100,
        concentrationRisk: spendTotal > 0 ? (spend / spendTotal) * 100 : 0,
        reliabilityScore: calculateVendorReliability(vendor, vendorPos, lineItemsByPo),
      };
    });
  },
};
