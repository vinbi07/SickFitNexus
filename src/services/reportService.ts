import { assertSupabase } from "@/lib/supabase";
import type { Alert, Product, PurchaseOrder } from "@/types/domain";

export const reportService = {
  async getExecutiveDataset() {
    const supabase = assertSupabase();
    const [poResponse, alertsResponse, productResponse] = await Promise.all([
      supabase.from("purchase_orders").select("*, vendors(*), locations(*)"),
      supabase.from("alerts").select("*"),
      supabase.from("products").select("*"),
    ]);
    if (poResponse.error) throw poResponse.error;
    if (alertsResponse.error) throw alertsResponse.error;
    if (productResponse.error) throw productResponse.error;

    return {
      purchaseOrders: (poResponse.data ?? []) as PurchaseOrder[],
      alerts: (alertsResponse.data ?? []) as Alert[],
      products: (productResponse.data ?? []) as Product[],
    };
  },
};
