import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, insertTable, upsertTable } from "@/services/baseService";
import { dashboardSessionService } from "@/services/dashboardSessionService";
import { inventoryService } from "@/services/inventoryService";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import {
  buildPurchaseOrderDocumentHtml,
  buildPurchaseOrderDocumentModel,
  formatPoCurrency,
  getPurchaseOrderDocumentStyles,
} from "@/utils/purchaseOrderDocument";
import type {
  ActivityEvent,
  Buyer,
  Comment,
  ComplianceHold,
  GeneratedPurchaseOrderDocument,
  InventoryEvent,
  InventoryReservation,
  Location,
  PoLineItem,
  Product,
  PurchaseOrder,
  PurchaseOrderCounterEvent,
  PurchaseOrderDocument,
  PurchaseOrderNotification,
  PurchaseOrderMessage,
  PurchaseOrderStatusHistory,
  Retailer,
  Vendor,
} from "@/types/domain";

type DashboardActor = {
  actorUserId: string | null;
  actorLabel: string | null;
};

function attachPurchaseOrderRelations(
  purchaseOrders: PurchaseOrder[],
  vendors: Vendor[],
  retailers: Retailer[],
  buyers: Buyer[],
  locations: Location[],
) {
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const retailersById = new Map(retailers.map((retailer) => [retailer.id, retailer]));
  const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
  const locationsById = new Map(locations.map((location) => [location.id, location]));

  return purchaseOrders.map((purchaseOrder) => ({
    ...purchaseOrder,
    vendors: purchaseOrder.vendor_id ? vendorsById.get(purchaseOrder.vendor_id) ?? null : null,
    retailers: purchaseOrder.retailer_id ? retailersById.get(purchaseOrder.retailer_id) ?? null : null,
    buyers: purchaseOrder.buyer_id ? buyersById.get(purchaseOrder.buyer_id) ?? null : null,
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

function normalizeOptionalText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function omitEmptyId<T extends { id?: string | null }>(payload: T): Omit<T, "id"> | T {
  if (!payload.id) {
    const { id: _id, ...rest } = payload;
    return rest;
  }
  return payload;
}

function buildGeneratedDocumentHtml(
  purchaseOrder: Partial<PurchaseOrder>,
  lineItems: Array<Partial<PoLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
) {
  return buildPurchaseOrderDocumentHtml(purchaseOrder, lineItems, buyer, retailer);
}

async function getDashboardActor(): Promise<DashboardActor> {
  const user = await dashboardSessionService.requireCurrentUser();
  return {
    actorUserId: user.id,
    actorLabel: user.display_name || user.email,
  };
}

async function recordStatusHistory(
  purchaseOrderId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: DashboardActor,
  notes?: string | null,
) {
  await insertTable<PurchaseOrderStatusHistory>("purchase_order_status_history", {
    purchase_order_id: purchaseOrderId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_user_id: actor.actorUserId,
    actor_label: actor.actorLabel,
    notes: notes ?? null,
  });
}

async function upsertGeneratedDocument(
  purchaseOrder: PurchaseOrder,
  lineItems: Array<Partial<PoLineItem>>,
  buyer?: Buyer | null,
  retailer?: Retailer | null,
  actor?: DashboardActor,
) {
  const supabase = assertSupabase();
  const bodyHtml = buildGeneratedDocumentHtml(purchaseOrder, lineItems, buyer, retailer);
  const { data: existing } = await supabase
    .from("generated_purchase_order_documents")
    .select("id")
    .eq("purchase_order_id", purchaseOrder.id)
    .maybeSingle();

  const [savedDoc] = (await upsertTable<GeneratedPurchaseOrderDocument>("generated_purchase_order_documents", {
    id: existing?.id,
    purchase_order_id: purchaseOrder.id,
    document_format: "html",
    title: `Generated PO ${purchaseOrder.po_number}`,
    body_html: bodyHtml,
    created_by_user_id: actor?.actorUserId ?? null,
    created_by_label: actor?.actorLabel ?? null,
  })) as GeneratedPurchaseOrderDocument[];

  const { data: existingLegacyDoc } = await supabase
    .from("purchase_order_documents")
    .select("id")
    .eq("purchase_order_id", purchaseOrder.id)
    .eq("document_type", "Generated Form")
    .maybeSingle();

  await upsertTable<PurchaseOrderDocument>("purchase_order_documents", {
    id: existingLegacyDoc?.id,
    purchase_order_id: purchaseOrder.id,
    document_type: "Generated Form",
    title: savedDoc.title,
    file_url: null,
  });

  return savedDoc;
}

async function upsertReservationLedger(
  purchaseOrderId: string,
  lineItems: PoLineItem[],
  actor: DashboardActor,
  nextStatus: InventoryReservation["status"],
  actionType: InventoryReservation["action_type"],
  note?: string | null,
) {
  const supabase = assertSupabase();
  for (const item of lineItems) {
    if (!item.product_id) continue;
    const { data: existing } = await supabase
      .from("inventory_reservations")
      .select("id")
      .eq("purchase_order_id", purchaseOrderId)
      .eq("po_line_item_id", item.id)
      .maybeSingle();

    await upsertTable<InventoryReservation>("inventory_reservations", {
      id: existing?.id,
      purchase_order_id: purchaseOrderId,
      po_line_item_id: item.id,
      product_id: item.product_id,
      reserved_units: Number(item.unit_quantity ?? item.quantity_ordered ?? 0),
      status: nextStatus,
      action_type: actionType,
      actor_user_id: actor.actorUserId,
      actor_label: actor.actorLabel,
      notes: note ?? null,
    });
  }
}

export const purchaseOrderService = {
  async generatePoNumber() {
    const supabase = assertSupabase();
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `PO-${dateStamp}`;
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .ilike("po_number", `${prefix}%`);
    if (error) throw error;
    const sequence = String((data ?? []).length + 1).padStart(4, "0");
    return `${prefix}-${sequence}`;
  },

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
      .order("updated_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters?.retailerId) query = query.eq("retailer_id", filters.retailerId);
    if (filters?.locationId) query = query.eq("location_id", filters.locationId);
    if (filters?.poType) query = query.eq("po_type", filters.poType);
    if (filters?.search) query = query.or(`po_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const purchaseOrders = (data ?? []) as PurchaseOrder[];
    const [vendorResponse, retailerResponse, buyerResponse, locationResponse] = await Promise.all([
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("buyers").select("*"),
      supabase.from("locations").select("*"),
    ]);

    if (vendorResponse.error) throw vendorResponse.error;
    if (retailerResponse.error) throw retailerResponse.error;
    if (buyerResponse.error) throw buyerResponse.error;
    if (locationResponse.error) throw locationResponse.error;

    return attachPurchaseOrderRelations(
      purchaseOrders,
      (vendorResponse.data ?? []) as Vendor[],
      (retailerResponse.data ?? []) as Retailer[],
      (buyerResponse.data ?? []) as Buyer[],
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
      buyerResponse,
      locationResponse,
      productResponse,
      eventsResponse,
      messagesResponse,
      documentsResponse,
      notificationsResponse,
      reservationsResponse,
      statusHistoryResponse,
      counterEventsResponse,
      complianceHoldsResponse,
      generatedDocsResponse,
    ] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", id).single(),
      supabase.from("po_line_items").select("*").eq("purchase_order_id", id),
      supabase.from("comments").select("*").eq("related_entity_type", "purchase_order").eq("related_entity_id", id).order("created_at", { ascending: false }),
      supabase.from("activity_events").select("*").eq("entity_id", id).order("created_at", { ascending: false }),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("buyers").select("*"),
      supabase.from("locations").select("*"),
      supabase.from("products").select("*"),
      supabase.from("inventory_events").select("*"),
      supabase.from("purchase_order_messages").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("purchase_order_documents").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("purchase_order_notifications").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("inventory_reservations").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("purchase_order_status_history").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("purchase_order_counter_events").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("compliance_holds").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
      supabase.from("generated_purchase_order_documents").select("*").eq("purchase_order_id", id).order("created_at", { ascending: false }),
    ]);

    [
      poResponse,
      lineItemsResponse,
      commentsResponse,
      activityResponse,
      vendorResponse,
      retailerResponse,
      buyerResponse,
      locationResponse,
      productResponse,
      eventsResponse,
      messagesResponse,
      documentsResponse,
      notificationsResponse,
      reservationsResponse,
      statusHistoryResponse,
      counterEventsResponse,
      complianceHoldsResponse,
      generatedDocsResponse,
    ].forEach((response) => {
      if (response.error) throw response.error;
    });

    const [purchaseOrder] = attachPurchaseOrderRelations(
      [poResponse.data as PurchaseOrder],
      (vendorResponse.data ?? []) as Vendor[],
      (retailerResponse.data ?? []) as Retailer[],
      (buyerResponse.data ?? []) as Buyer[],
      (locationResponse.data ?? []) as Location[],
    );

    const calculatedProducts = applyCalculatedSafetyStock(
      (productResponse.data ?? []) as Product[],
      (vendorResponse.data ?? []) as Vendor[],
      (eventsResponse.data ?? []) as InventoryEvent[],
    );

    return {
      purchaseOrder,
      lineItems: attachLineItemRelations((lineItemsResponse.data ?? []) as PoLineItem[], calculatedProducts),
      comments: (commentsResponse.data ?? []) as Comment[],
      activity: (activityResponse.data ?? []) as ActivityEvent[],
      messages: (messagesResponse.data ?? []) as PurchaseOrderMessage[],
      documents: (documentsResponse.data ?? []) as PurchaseOrderDocument[],
      notifications: (notificationsResponse.data ?? []) as PurchaseOrderNotification[],
      reservations: (reservationsResponse.data ?? []) as InventoryReservation[],
      statusHistory: (statusHistoryResponse.data ?? []) as PurchaseOrderStatusHistory[],
      counterEvents: (counterEventsResponse.data ?? []) as PurchaseOrderCounterEvent[],
      complianceHolds: (complianceHoldsResponse.data ?? []) as ComplianceHold[],
      generatedDocuments: (generatedDocsResponse.data ?? []) as GeneratedPurchaseOrderDocument[],
    };
  },

  async savePurchaseOrder(input: {
    purchaseOrder: Partial<PurchaseOrder>;
    lineItems: Array<Partial<PoLineItem>>;
  }) {
    const { vendors: _vendors, retailers: _retailers, locations: _locations, buyers: _buyers, ...purchaseOrderPayload } = input.purchaseOrder;
    const normalizedLineItems = input.lineItems.map((item) => ({
      ...(() => {
        const { products: _products, ...lineItemPayload } = item;
        return lineItemPayload;
      })(),
      quantity_ordered: Number(item.quantity_ordered ?? 0),
      quantity_received: Number(item.quantity_received ?? 0),
      unit_cost: Number(item.unit_cost ?? 0),
      line_total: Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0),
      upc: item.upc ? String(item.upc) : null,
      variant_label: item.variant_label ? String(item.variant_label) : null,
      description: item.description ? String(item.description) : null,
      unit: item.unit ? String(item.unit) : "EA",
      case_pack_quantity: Number(item.case_pack_quantity ?? 1),
      case_quantity: Number(item.case_quantity ?? 0),
      unit_quantity: Number(item.unit_quantity ?? item.quantity_ordered ?? 0),
      unit_retail: Number(item.unit_retail ?? 0),
      extended_cost: Number(item.extended_cost ?? Number(item.quantity_ordered ?? 0) * Number(item.unit_cost ?? 0)),
      extended_retail: Number(item.extended_retail ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    }));
    const totalCost = normalizedLineItems.reduce((sum, item) => sum + Number(item.extended_cost ?? item.line_total ?? 0), 0);
    const totalUnits = normalizedLineItems.reduce((sum, item) => sum + Number(item.unit_quantity ?? item.quantity_ordered ?? 0), 0);
    const totalRetail = normalizedLineItems.reduce((sum, item) => sum + Number(item.extended_retail ?? 0), 0);

    const [savedPo] = (await upsertTable<PurchaseOrder>(
      "purchase_orders",
      omitEmptyId({
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
        bill_to_company_name: normalizeOptionalText(purchaseOrderPayload.bill_to_company_name),
        bill_to_contact_name: normalizeOptionalText(purchaseOrderPayload.bill_to_contact_name),
        bill_to_street: normalizeOptionalText(purchaseOrderPayload.bill_to_street),
        bill_to_city: normalizeOptionalText(purchaseOrderPayload.bill_to_city),
        bill_to_state: normalizeOptionalText(purchaseOrderPayload.bill_to_state),
        bill_to_zip: normalizeOptionalText(purchaseOrderPayload.bill_to_zip),
        bill_to_phone: normalizeOptionalText(purchaseOrderPayload.bill_to_phone),
        bill_to_email: normalizeOptionalText(purchaseOrderPayload.bill_to_email),
        ship_to_company_name: normalizeOptionalText(purchaseOrderPayload.ship_to_company_name),
        ship_to_attention: normalizeOptionalText(purchaseOrderPayload.ship_to_attention),
        ship_to_street: normalizeOptionalText(purchaseOrderPayload.ship_to_street),
        ship_to_city: normalizeOptionalText(purchaseOrderPayload.ship_to_city),
        ship_to_state: normalizeOptionalText(purchaseOrderPayload.ship_to_state),
        ship_to_zip: normalizeOptionalText(purchaseOrderPayload.ship_to_zip),
        ship_to_phone: normalizeOptionalText(purchaseOrderPayload.ship_to_phone),
        payment_terms_snapshot: normalizeOptionalText(purchaseOrderPayload.payment_terms_snapshot),
        buyer_name_snapshot: normalizeOptionalText(purchaseOrderPayload.buyer_name_snapshot),
        approver_name_snapshot: normalizeOptionalText(purchaseOrderPayload.approver_name_snapshot),
        total_cost: totalCost,
        subtotal: Number(purchaseOrderPayload.subtotal ?? totalCost),
        total_units: Number(purchaseOrderPayload.total_units ?? totalUnits),
        total_retail: Number(purchaseOrderPayload.total_retail ?? totalRetail),
        currency_code: purchaseOrderPayload.currency_code ?? "USD",
        generated_form_url: null,
      }),
    )) as PurchaseOrder[];

    const supabase = assertSupabase();
    const { data: existingItems, error: existingError } = await supabase.from("po_line_items").select("id").eq("purchase_order_id", savedPo.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingItems ?? []) as Array<{ id: string }>).map((item) => item.id));
    const submittedIds = new Set(normalizedLineItems.map((item) => item.id).filter((id): id is string => Boolean(id)));

    await Promise.all([...existingIds].filter((id) => !submittedIds.has(id)).map((id) => deleteFromTable("po_line_items", id)));

    let savedLineItems: PoLineItem[] = [];
    if (normalizedLineItems.length) {
      savedLineItems = (await upsertTable<PoLineItem>(
        "po_line_items",
        normalizedLineItems.map((item) => ({
          ...omitEmptyId(item),
          id: item.id || crypto.randomUUID(),
          purchase_order_id: savedPo.id,
        })),
      )) as PoLineItem[];
    }

    const actor = await dashboardSessionService.getCurrentUser().catch(() => null);
    await upsertGeneratedDocument(
      savedPo,
      savedLineItems,
      input.purchaseOrder.buyers ?? null,
      input.purchaseOrder.retailers ?? null,
      actor ? { actorUserId: actor.id, actorLabel: actor.display_name || actor.email } : undefined,
    );

    await activityService.create({
      event_type: savedPo.id === input.purchaseOrder.id ? "purchase_order_updated" : "purchase_order_created",
      entity_type: "purchase_order",
      entity_id: savedPo.id,
      title: savedPo.id === input.purchaseOrder.id ? `PO ${savedPo.po_number} updated` : `PO ${savedPo.po_number} created`,
      description: `${savedPo.status} | ${savedLineItems.length} line items`,
      metadata: { purchaseOrderId: savedPo.id },
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

  async updateStatus(id: string, status: PurchaseOrder["status"], actor?: DashboardActor, notes?: string | null) {
    const supabase = assertSupabase();
    const { data: beforeRow, error: beforeError } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
    if (beforeError) throw beforeError;
    const { data, error } = await supabase.from("purchase_orders").update({ status }).eq("id", id).select("*").single();
    if (error) throw error;

    if (actor) {
      await recordStatusHistory(id, (beforeRow as PurchaseOrder).status, status, actor, notes);
    }

    await activityService.create({
      event_type: "purchase_order_status_updated",
      entity_type: "purchase_order",
      entity_id: id,
      title: `PO status changed to ${status}`,
      description: `Purchase order status updated to ${status}.`,
      metadata: { purchaseOrderId: id, status },
    });
    return data as PurchaseOrder;
  },

  async approve(id: string, note?: string) {
    const actor = await getDashboardActor();
    const detail = await this.getById(id);
    const updated = await this.updateStatus(id, "Ordered", actor, note ?? "Approved for fulfillment.");
    const supabase = assertSupabase();
    await supabase
      .from("purchase_orders")
      .update({
        approval_status: "Approved",
        allocation_status: "Allocated",
        approved_at: new Date().toISOString(),
        approved_by: actor.actorLabel,
        hold_reason: null,
        counter_status: detail.purchaseOrder.counter_status === "Countered" ? "Accepted" : detail.purchaseOrder.counter_status,
      })
      .eq("id", id);

    if (detail.complianceHolds.some((hold) => hold.status === "Open")) {
      await supabase
        .from("compliance_holds")
        .update({ status: "Resolved", resolved_at: new Date().toISOString(), notes: note ?? "Approved after review." })
        .eq("purchase_order_id", id)
        .eq("status", "Open");
    }

    await upsertReservationLedger(id, detail.lineItems, actor, "Reserved", "approve", note ?? null);
    await activityService.create({
      event_type: "purchase_order_approved",
      entity_type: "purchase_order",
      entity_id: id,
      title: `PO ${updated.po_number} approved`,
      description: `${actor.actorLabel} approved the order for fulfillment review.`,
      metadata: { purchaseOrderId: id, approver: actor.actorLabel },
    });
    return detail;
  },

  async reject(id: string, reason?: string) {
    const actor = await getDashboardActor();
    const detail = await this.getById(id);
    await inventoryService.releaseProducts(
      detail.lineItems.reduce<Array<{ productId: string; units: number }>>((accumulator, item) => {
        if (item.product_id) {
          accumulator.push({
            productId: item.product_id,
            units: Number(item.unit_quantity ?? item.quantity_ordered ?? 0),
          });
        }
        return accumulator;
      }, []),
    );

    await upsertReservationLedger(id, detail.lineItems, actor, "Released", "reject", reason ?? null);
    const supabase = assertSupabase();
    await supabase
      .from("purchase_orders")
      .update({
        status: "Cancelled",
        approval_status: "Rejected",
        allocation_status: "Released",
        cancelled_at: new Date().toISOString(),
        internal_notes: reason ?? detail.purchaseOrder.internal_notes,
      })
      .eq("id", id);

    await recordStatusHistory(id, detail.purchaseOrder.status, "Cancelled", actor, reason ?? null);
    await activityService.create({
      event_type: "purchase_order_rejected",
      entity_type: "purchase_order",
      entity_id: id,
      title: `PO ${detail.purchaseOrder.po_number} rejected`,
      description: reason ?? "Purchase order rejected.",
      metadata: { purchaseOrderId: id },
    });
  },

  async counter(id: string, notes: string) {
    const actor = await getDashboardActor();
    const detail = await this.getById(id);
    const supabase = assertSupabase();
    await supabase
      .from("purchase_orders")
      .update({
        status: "Countered",
        counter_status: "Countered",
        internal_notes: notes,
      })
      .eq("id", id);

    await recordStatusHistory(id, detail.purchaseOrder.status, "Countered", actor, notes);
    await insertTable<PurchaseOrderCounterEvent>("purchase_order_counter_events", {
      purchase_order_id: id,
      actor_user_id: actor.actorUserId,
      actor_label: actor.actorLabel,
      event_type: "countered",
      notes,
      payload: {
        priorStatus: detail.purchaseOrder.status,
      },
    });
  },

  async queueForFulfillment(id: string) {
    const actor = await getDashboardActor();
    const detail = await this.getById(id);
    const supabase = assertSupabase();
    await supabase
      .from("purchase_orders")
      .update({
        allocation_status: "Queued for Fulfillment",
        queued_for_fulfillment_at: new Date().toISOString(),
      })
      .eq("id", id);

    await upsertReservationLedger(id, detail.lineItems, actor, "Reserved", "manual", "Queued for fulfillment.");
    await activityService.create({
      event_type: "purchase_order_queued_for_fulfillment",
      entity_type: "purchase_order",
      entity_id: id,
      title: `PO ${detail.purchaseOrder.po_number} queued for fulfillment`,
      description: "Allocated inventory is ready for fulfillment.",
      metadata: { purchaseOrderId: id },
    });
  },

  async fulfill(id: string) {
    const actor = await getDashboardActor();
    const detail = await this.getById(id);
    await inventoryService.fulfillProducts(
      detail.lineItems.reduce<Array<{ productId: string; units: number; locationId?: string | null; relatedPoId?: string | null }>>((accumulator, item) => {
        if (item.product_id) {
          accumulator.push({
            productId: item.product_id,
            units: Number(item.unit_quantity ?? item.quantity_ordered ?? 0),
            locationId: detail.purchaseOrder.location_id,
            relatedPoId: id,
          });
        }
        return accumulator;
      }, []),
    );

    await upsertReservationLedger(id, detail.lineItems, actor, "Committed", "fulfill", "Inventory committed on fulfillment.");
    const supabase = assertSupabase();
    await supabase
      .from("purchase_orders")
      .update({
        status: "Fulfilled",
        allocation_status: "Fulfilled",
      })
      .eq("id", id);

    await recordStatusHistory(id, detail.purchaseOrder.status, "Fulfilled", actor, "Inventory committed.");
  },

  async saveComplianceHold(payload: Partial<ComplianceHold>) {
    const [saved] = (await upsertTable<ComplianceHold>("compliance_holds", payload)) as ComplianceHold[];
    return saved;
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
