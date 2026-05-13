import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import type { ActivityEvent, Comment, Location, PoLineItem, Product, PurchaseOrder, Vendor } from "@/types/domain";

function attachPurchaseOrderRelations(
  purchaseOrders: PurchaseOrder[],
  vendors: Vendor[],
  locations: Location[],
) {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  return purchaseOrders.map((purchaseOrder) => ({
    ...purchaseOrder,
    vendors: purchaseOrder.vendor_id ? vendorsById.get(purchaseOrder.vendor_id) ?? null : null,
    locations: purchaseOrder.location_id ? locationsById.get(purchaseOrder.location_id) ?? null : null,
  }));
}

function attachLineItemRelations(lineItems: PoLineItem[], products: Product[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  return lineItems.map((lineItem) => ({
    ...lineItem,
    products: lineItem.product_id ? productsById.get(lineItem.product_id) ?? null : null,
  }));
}

function normalizeOptionalDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

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
      .select("*")
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

    const purchaseOrders = (data ?? []) as PurchaseOrder[];
    const vendorIds = [...new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.vendor_id).filter(Boolean))] as string[];
    const locationIds = [...new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.location_id).filter(Boolean))] as string[];

    const [vendorResponse, locationResponse] = await Promise.all([
      vendorIds.length ? supabase.from("vendors").select("*").in("id", vendorIds) : Promise.resolve({ data: [], error: null }),
      locationIds.length ? supabase.from("locations").select("*").in("id", locationIds) : Promise.resolve({ data: [], error: null }),
    ]);

    if (vendorResponse.error) throw vendorResponse.error;
    if (locationResponse.error) throw locationResponse.error;

    return attachPurchaseOrderRelations(
      purchaseOrders,
      (vendorResponse.data ?? []) as Vendor[],
      (locationResponse.data ?? []) as Location[],
    );
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [poResponse, lineItemsResponse, commentsResponse, activityResponse, vendorResponse, locationResponse, productResponse] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", id).single(),
      supabase.from("po_line_items").select("*").eq("purchase_order_id", id),
      supabase.from("comments").select("*").eq("related_entity_type", "purchase_order").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
      supabase.from("vendors").select("*"),
      supabase.from("locations").select("*"),
      supabase.from("products").select("*"),
    ]);

    if (poResponse.error) throw poResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    if (commentsResponse.error) throw commentsResponse.error;
    if (activityResponse.error) throw activityResponse.error;
    if (vendorResponse.error) throw vendorResponse.error;
    if (locationResponse.error) throw locationResponse.error;
    if (productResponse.error) throw productResponse.error;

    const [purchaseOrder] = attachPurchaseOrderRelations(
      [poResponse.data as PurchaseOrder],
      (vendorResponse.data ?? []) as Vendor[],
      (locationResponse.data ?? []) as Location[],
    );

    return {
      purchaseOrder,
      lineItems: attachLineItemRelations(
        (lineItemsResponse.data ?? []) as PoLineItem[],
        (productResponse.data ?? []) as Product[],
      ),
      comments: (commentsResponse.data ?? []) as Comment[],
      activity: (activityResponse.data ?? []) as ActivityEvent[],
    };
  },

  async savePurchaseOrder(input: {
    purchaseOrder: Partial<PurchaseOrder>;
    lineItems: Array<Partial<PoLineItem>>;
  }) {
    const supabase = assertSupabase();
    const { vendors: _vendors, locations: _locations, ...purchaseOrderPayload } = input.purchaseOrder;
    const normalizedLineItems = input.lineItems.map((item) => ({
      ...(() => {
        const { products: _products, ...lineItemPayload } = item;
        return lineItemPayload;
      })(),
      quantity_ordered: Number(item.quantity_ordered ?? 0),
      quantity_received: Number(item.quantity_received ?? 0),
      unit_cost: Number(item.unit_cost ?? 0),
      line_total: Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0),
    }));
    const totalCost = normalizedLineItems.reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);

    const [savedPo] = (await upsertTable<PurchaseOrder>("purchase_orders", {
      ...purchaseOrderPayload,
      order_date: normalizeOptionalDate(purchaseOrderPayload.order_date),
      expected_delivery_date: normalizeOptionalDate(purchaseOrderPayload.expected_delivery_date),
      actual_delivery_date: normalizeOptionalDate(purchaseOrderPayload.actual_delivery_date),
      total_cost: totalCost,
    })) as PurchaseOrder[];

    const { data: existingItems, error: existingError } = await supabase
      .from("po_line_items")
      .select("id")
      .eq("purchase_order_id", savedPo.id);
    if (existingError) throw existingError;

    const existingIds = new Set(
      ((existingItems ?? []) as Array<{ id: string }>).map((item: { id: string }) => item.id),
    );
    const submittedIds = new Set(
      normalizedLineItems.map((item) => item.id).filter((id): id is string => Boolean(id)),
    );

    await Promise.all(
      [...existingIds]
        .filter((id: string) => !submittedIds.has(id))
        .map((id: string) => deleteFromTable("po_line_items", id)),
    );

    if (normalizedLineItems.length) {
      await upsertTable<PoLineItem>(
        "po_line_items",
        normalizedLineItems.map((item) => ({
          ...item,
          purchase_order_id: savedPo.id,
        })),
      );
    }

    await activityService.create({
      event_type: savedPo.id === input.purchaseOrder.id ? "purchase_order_updated" : "purchase_order_created",
      entity_type: "purchase_order",
      entity_id: savedPo.id,
      title: savedPo.id === input.purchaseOrder.id ? `PO ${savedPo.po_number} updated` : `PO ${savedPo.po_number} created`,
      description: `${savedPo.status} • ${normalizedLineItems.length} line items`,
      metadata: { purchaseOrderId: savedPo.id },
    });

    return savedPo;
  },

  async updateStatus(id: string, status: PurchaseOrder["status"]) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("purchase_orders")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    const [vendorResponse, locationResponse] = await Promise.all([
      supabase.from("vendors").select("*"),
      supabase.from("locations").select("*"),
    ]);
    if (vendorResponse.error) throw vendorResponse.error;
    if (locationResponse.error) throw locationResponse.error;

    await activityService.create({
      event_type: "purchase_order_status_updated",
      entity_type: "purchase_order",
      entity_id: id,
      title: `PO status changed to ${status}`,
      description: `Purchase order status updated to ${status}.`,
      metadata: { purchaseOrderId: id, status },
    });
    return attachPurchaseOrderRelations(
      [data as PurchaseOrder],
      (vendorResponse.data ?? []) as Vendor[],
      (locationResponse.data ?? []) as Location[],
    )[0];
  },

  async remove(id: string) {
    await deleteFromTable("purchase_orders", id);
    await activityService.create({
      event_type: "purchase_order_deleted",
      entity_type: "purchase_order",
      entity_id: id,
      title: "Purchase order deleted",
      description: "A purchase order and its line items were removed.",
      metadata: { purchaseOrderId: id },
    });
  },
};
