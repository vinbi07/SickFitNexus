import { assertSupabase } from "@/lib/supabase";
import type { Comment, PoLineItem, PurchaseOrder } from "@/types/domain";

export const purchaseOrderService = {
  async list(filters?: {
    status?: string;
    vendorId?: string;
    locationId?: string;
    search?: string;
  }) {
    const supabase = assertSupabase();
    let query = supabase
      .from("purchase_orders")
      .select("*, vendors(*), locations(*)")
      .order("order_date", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.locationId) query = query.eq("location_id", filters.locationId);
    if (filters?.search) {
      query = query.or(
        `po_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as PurchaseOrder[];
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [poResponse, lineItemsResponse, commentsResponse, activityResponse] = await Promise.all([
      supabase.from("purchase_orders").select("*, vendors(*), locations(*)").eq("id", id).single(),
      supabase.from("po_line_items").select("*, products(*)").eq("purchase_order_id", id),
      supabase.from("comments").select("*").eq("related_entity_type", "purchase_order").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
    ]);

    if (poResponse.error) throw poResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    if (commentsResponse.error) throw commentsResponse.error;
    if (activityResponse.error) throw activityResponse.error;

    return {
      purchaseOrder: poResponse.data as PurchaseOrder,
      lineItems: (lineItemsResponse.data ?? []) as PoLineItem[],
      comments: (commentsResponse.data ?? []) as Comment[],
      activity: activityResponse.data ?? [],
    };
  },
};
