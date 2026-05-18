import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, insertTable, upsertTable } from "@/services/baseService";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import type {
  ActivityEvent,
  Comment,
  InventoryEvent,
  Location,
  PoLineItem,
  Product,
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderMessage,
  Retailer,
  Vendor,
} from "@/types/domain";

function attachPurchaseOrderRelations(
  purchaseOrders: PurchaseOrder[],
  vendors: Vendor[],
  retailers: Retailer[],
  locations: Location[],
) {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const retailersById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  return purchaseOrders.map((purchaseOrder) => ({
    ...purchaseOrder,
    vendors: purchaseOrder.vendor_id ? vendorsById.get(purchaseOrder.vendor_id) ?? null : null,
    retailers: purchaseOrder.retailer_id ? retailersById.get(purchaseOrder.retailer_id) ?? null : null,
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

function buildGeneratedFormText(
  purchaseOrder: Partial<PurchaseOrder>,
  lineItems: Array<Partial<PoLineItem>>,
  retailerName?: string | null,
) {
  const header = [
    `SickFit Order Form`,
    `PO Number: ${purchaseOrder.po_number ?? "TBD"}`,
    `Retailer: ${retailerName ?? "Unassigned"}`,
    `Submitted: ${purchaseOrder.submitted_at ?? purchaseOrder.order_date ?? "TBD"}`,
    "",
    "Line Items",
  ];

  const rows = lineItems.map((item) =>
    `- ${item.sku ?? "SKU"} | ${item.product_name ?? "Product"} | Qty ${Number(item.quantity_ordered ?? 0)} | Unit ${Number(item.unit_cost ?? 0)}`,
  );

  return [...header, ...rows, "", `Notes: ${purchaseOrder.notes ?? ""}`].join("\n");
}

export const purchaseOrderService = {
  async list(filters?: {
    status?: string;
    vendorId?: string;
    retailerId?: string;
    locationId?: string;
    poType?: string;
    search?: string;
  }) {
    const supabase = assertSupabase();
    let query = supabase
      .from("purchase_orders")
      .select("*")
      .order("order_date", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.retailerId) query = query.eq("retailer_id", filters.retailerId);
    if (filters?.locationId) query = query.eq("location_id", filters.locationId);
    if (filters?.poType) query = query.eq("po_type", filters.poType);
    if (filters?.search) {
      query = query.or(`po_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const purchaseOrders = (data ?? []) as PurchaseOrder[];
    const [vendorResponse, retailerResponse, locationResponse] = await Promise.all([
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("locations").select("*"),
    ]);

    if (vendorResponse.error) throw vendorResponse.error;
    if (retailerResponse.error) throw retailerResponse.error;
    if (locationResponse.error) throw locationResponse.error;

    return attachPurchaseOrderRelations(
      purchaseOrders,
      (vendorResponse.data ?? []) as Vendor[],
      (retailerResponse.data ?? []) as Retailer[],
      (locationResponse.data ?? []) as Location[],
    );
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [
      poResponse,
      lineItemsResponse,
      commentsResponse,
      activityResponse,
      vendorResponse,
      retailerResponse,
      locationResponse,
      productResponse,
      eventsResponse,
      messagesResponse,
      documentsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", id).single(),
      supabase.from("po_line_items").select("*").eq("purchase_order_id", id),
      supabase.from("comments").select("*").eq("related_entity_type", "purchase_order").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("locations").select("*"),
      supabase.from("products").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("purchase_order_messages").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("purchase_order_documents").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
    ]);

    if (poResponse.error) throw poResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    if (commentsResponse.error) throw commentsResponse.error;
    if (activityResponse.error) throw activityResponse.error;
    if (vendorResponse.error) throw vendorResponse.error;
    if (retailerResponse.error) throw retailerResponse.error;
    if (locationResponse.error) throw locationResponse.error;
    if (productResponse.error) throw productResponse.error;
    if (eventsResponse.error) throw eventsResponse.error;
    if (messagesResponse.error) throw messagesResponse.error;
    if (documentsResponse.error) throw documentsResponse.error;

    const [purchaseOrder] = attachPurchaseOrderRelations(
      [poResponse.data as PurchaseOrder],
      (vendorResponse.data ?? []) as Vendor[],
      (retailerResponse.data ?? []) as Retailer[],
      (locationResponse.data ?? []) as Location[],
    );

    const calculatedProducts = applyCalculatedSafetyStock(
      (productResponse.data ?? []) as Product[],
      (vendorResponse.data ?? []) as Vendor[],
      (eventsResponse.data ?? []) as InventoryEvent[],
    );

    return {
      purchaseOrder,
      lineItems: attachLineItemRelations(
        (lineItemsResponse.data ?? []) as PoLineItem[],
        calculatedProducts,
      ),
      comments: (commentsResponse.data ?? []) as Comment[],
      activity: (activityResponse.data ?? []) as ActivityEvent[],
      messages: (messagesResponse.data ?? []) as PurchaseOrderMessage[],
      documents: (documentsResponse.data ?? []) as PurchaseOrderDocument[],
    };
  },

  async savePurchaseOrder(input: {
    purchaseOrder: Partial<PurchaseOrder>;
    lineItems: Array<Partial<PoLineItem>>;
  }) {
    const { vendors: _vendors, retailers: _retailers, locations: _locations, ...purchaseOrderPayload } = input.purchaseOrder;
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

    const generatedText = buildGeneratedFormText(
      purchaseOrderPayload,
      normalizedLineItems,
      input.purchaseOrder.retailers?.name ?? null,
    );
    const generatedFormUrl =
      purchaseOrderPayload.generated_form_url ??
      `data:text/plain;charset=utf-8,${encodeURIComponent(generatedText)}`;

    const [savedPo] = (await upsertTable<PurchaseOrder>("purchase_orders", {
      ...purchaseOrderPayload,
      order_date: normalizeOptionalDate(purchaseOrderPayload.order_date),
      ship_date: normalizeOptionalDate(purchaseOrderPayload.ship_date),
      submitted_at: normalizeOptionalDate(purchaseOrderPayload.submitted_at),
      eta_date: normalizeOptionalDate(purchaseOrderPayload.eta_date),
      expected_delivery_date: normalizeOptionalDate(purchaseOrderPayload.expected_delivery_date),
      actual_delivery_date: normalizeOptionalDate(purchaseOrderPayload.actual_delivery_date),
      invoice_status: purchaseOrderPayload.invoice_status ?? null,
      invoice_paid_at: normalizeOptionalDate(purchaseOrderPayload.invoice_paid_at),
      shipment_status: purchaseOrderPayload.shipment_status ? String(purchaseOrderPayload.shipment_status) : null,
      total_cost: totalCost,
      generated_form_url: generatedFormUrl,
    })) as PurchaseOrder[];

    const supabase = assertSupabase();
    const { data: existingItems, error: existingError } = await supabase
      .from("po_line_items")
      .select("id")
      .eq("purchase_order_id", savedPo.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingItems ?? []) as Array<{ id: string }>).map((item) => item.id));
    const submittedIds = new Set(normalizedLineItems.map((item) => item.id).filter((id): id is string => Boolean(id)));

    await Promise.all(
      [...existingIds].filter((id) => !submittedIds.has(id)).map((id) => deleteFromTable("po_line_items", id)),
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
      description: `${savedPo.status} | ${normalizedLineItems.length} line items`,
      metadata: { purchaseOrderId: savedPo.id },
    });

    const { data: existingDocument } = await supabase
      .from("purchase_order_documents")
      .select("id")
      .eq("purchase_order_id", savedPo.id)
      .eq("document_type", "Generated Form")
      .maybeSingle();

    await upsertTable<PurchaseOrderDocument>("purchase_order_documents", {
      id: existingDocument?.id,
      purchase_order_id: savedPo.id,
      document_type: "Generated Form",
      title: `Generated form for ${savedPo.po_number}`,
      file_url: generatedFormUrl,
    });

    return savedPo;
  },

  async saveMessage(payload: Partial<PurchaseOrderMessage>) {
    const [saved] = (await insertTable<PurchaseOrderMessage>("purchase_order_messages", payload)) as PurchaseOrderMessage[];
    await activityService.create({
      event_type: "purchase_order_message_added",
      entity_type: "purchase_order",
      entity_id: saved.purchase_order_id,
      title: "PO communication logged",
      description: `${saved.sender_name} via ${saved.channel}`,
      metadata: { purchaseOrderId: saved.purchase_order_id },
    });
    return saved;
  },

  async saveDocument(payload: Partial<PurchaseOrderDocument>) {
    const [saved] = (await insertTable<PurchaseOrderDocument>("purchase_order_documents", payload)) as PurchaseOrderDocument[];
    await activityService.create({
      event_type: "purchase_order_document_added",
      entity_type: "purchase_order",
      entity_id: saved.purchase_order_id,
      title: "PO document attached",
      description: saved.title,
      metadata: { purchaseOrderId: saved.purchase_order_id },
    });
    return saved;
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

    const [vendorResponse, retailerResponse, locationResponse] = await Promise.all([
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("locations").select("*"),
    ]);
    if (vendorResponse.error) throw vendorResponse.error;
    if (retailerResponse.error) throw retailerResponse.error;
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
      (retailerResponse.data ?? []) as Retailer[],
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
