import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  Buyer,
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
  Location,
  Retailer,
  Vendor,
} from "@/types/domain";

function attachInvoiceRelations(
  invoices: Invoice[],
  vendors: Vendor[],
  retailers: Retailer[],
  buyers: Buyer[],
  locations: Location[],
) {
  const vendorsById = new Map(vendors.map((v) => [v.id, v]));
  const retailersById = new Map(retailers.map((r) => [r.id, r]));
  const buyersById = new Map(buyers.map((b) => [b.id, b]));
  const locationsById = new Map(locations.map((l) => [l.id, l]));

  return invoices.map((invoice) => ({
    ...invoice,
    vendors: invoice.vendor_id ? vendorsById.get(invoice.vendor_id) ?? null : null,
    retailers: invoice.retailer_id ? retailersById.get(invoice.retailer_id) ?? null : null,
    buyers: invoice.buyer_id ? buyersById.get(invoice.buyer_id) ?? null : null,
    locations: invoice.location_id ? locationsById.get(invoice.location_id) ?? null : null,
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

export const invoiceService = {
  async generateInvoiceNumber(): Promise<string> {
    const supabase = assertSupabase();
    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = `INV-${dateStamp}`;
    const { data, error } = await supabase
      .from("invoices")
      .select("invoice_number")
      .ilike("invoice_number", `${prefix}%`);
    if (error) throw error;
    const sequence = String((data ?? []).length + 1).padStart(4, "0");
    return `${prefix}-${sequence}`;
  },

  async list(filters?: { status?: string; search?: string }) {
    const supabase = assertSupabase();
    let query = supabase
      .from("invoices")
      .select("*")
      .order("updated_at", { ascending: false });

    if (filters?.status) query = query.eq("status", filters.status);
    if (filters?.search) {
      query = query.or(`invoice_number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const invoices = (data ?? []) as Invoice[];
    const [vendorRes, retailerRes, buyerRes, locationRes] = await Promise.all([
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("buyers").select("*"),
      supabase.from("locations").select("*"),
    ]);

    if (vendorRes.error) throw vendorRes.error;
    if (retailerRes.error) throw retailerRes.error;
    if (buyerRes.error) throw buyerRes.error;
    if (locationRes.error) throw locationRes.error;

    return attachInvoiceRelations(
      invoices,
      (vendorRes.data ?? []) as Vendor[],
      (retailerRes.data ?? []) as Retailer[],
      (buyerRes.data ?? []) as Buyer[],
      (locationRes.data ?? []) as Location[],
    );
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [invoiceRes, lineItemsRes, vendorRes, retailerRes, buyerRes, locationRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", id).single(),
      supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order", { ascending: true }),
      supabase.from("vendors").select("*"),
      supabase.from("retailers").select("*"),
      supabase.from("buyers").select("*"),
      supabase.from("locations").select("*"),
    ]);

    [invoiceRes, lineItemsRes, vendorRes, retailerRes, buyerRes, locationRes].forEach((r) => {
      if (r.error) throw r.error;
    });

    const [invoice] = attachInvoiceRelations(
      [invoiceRes.data as Invoice],
      (vendorRes.data ?? []) as Vendor[],
      (retailerRes.data ?? []) as Retailer[],
      (buyerRes.data ?? []) as Buyer[],
      (locationRes.data ?? []) as Location[],
    );

    return {
      invoice,
      lineItems: (lineItemsRes.data ?? []) as InvoiceLineItem[],
    };
  },

  async save(input: { invoice: Partial<Invoice>; lineItems: Array<Partial<InvoiceLineItem>> }) {
    const { vendors: _v, retailers: _r, buyers: _b, locations: _l, ...invoicePayload } = input.invoice;

    const normalizedLineItems = input.lineItems.map((item) => ({
      ...(() => {
        const { products: _p, ...rest } = item;
        return rest;
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

    const totalCost = normalizedLineItems.reduce((sum, i) => sum + Number(i.extended_cost ?? i.line_total ?? 0), 0);
    const totalUnits = normalizedLineItems.reduce((sum, i) => sum + Number(i.unit_quantity ?? i.quantity_ordered ?? 0), 0);
    const totalRetail = normalizedLineItems.reduce((sum, i) => sum + Number(i.extended_retail ?? 0), 0);

    const [savedInvoice] = (await upsertTable<Invoice>(
      "invoices",
      omitEmptyId({
        ...invoicePayload,
        order_date: normalizeOptionalDate(invoicePayload.order_date),
        ship_date: normalizeOptionalDate(invoicePayload.ship_date),
        start_ship_date: normalizeOptionalDate(invoicePayload.start_ship_date),
        ship_complete_date: normalizeOptionalDate(invoicePayload.ship_complete_date),
        eta_date: normalizeOptionalDate(invoicePayload.eta_date),
        expected_delivery_date: normalizeOptionalDate(invoicePayload.expected_delivery_date),
        actual_delivery_date: normalizeOptionalDate(invoicePayload.actual_delivery_date),
        submitted_at: normalizeOptionalDate(invoicePayload.submitted_at),
        bill_to_company_name: normalizeOptionalText(invoicePayload.bill_to_company_name),
        bill_to_contact_name: normalizeOptionalText(invoicePayload.bill_to_contact_name),
        bill_to_street: normalizeOptionalText(invoicePayload.bill_to_street),
        bill_to_city: normalizeOptionalText(invoicePayload.bill_to_city),
        bill_to_state: normalizeOptionalText(invoicePayload.bill_to_state),
        bill_to_zip: normalizeOptionalText(invoicePayload.bill_to_zip),
        bill_to_phone: normalizeOptionalText(invoicePayload.bill_to_phone),
        bill_to_email: normalizeOptionalText(invoicePayload.bill_to_email),
        ship_to_company_name: normalizeOptionalText(invoicePayload.ship_to_company_name),
        ship_to_attention: normalizeOptionalText(invoicePayload.ship_to_attention),
        ship_to_street: normalizeOptionalText(invoicePayload.ship_to_street),
        ship_to_city: normalizeOptionalText(invoicePayload.ship_to_city),
        ship_to_state: normalizeOptionalText(invoicePayload.ship_to_state),
        ship_to_zip: normalizeOptionalText(invoicePayload.ship_to_zip),
        ship_to_phone: normalizeOptionalText(invoicePayload.ship_to_phone),
        payment_terms_snapshot: normalizeOptionalText(invoicePayload.payment_terms_snapshot),
        buyer_name_snapshot: normalizeOptionalText(invoicePayload.buyer_name_snapshot),
        approver_name_snapshot: normalizeOptionalText(invoicePayload.approver_name_snapshot),
        total_cost: totalCost,
        subtotal: Number(invoicePayload.subtotal ?? totalCost),
        total_units: Number(invoicePayload.total_units ?? totalUnits),
        total_retail: Number(invoicePayload.total_retail ?? totalRetail),
        currency_code: invoicePayload.currency_code ?? "USD",
      }),
    )) as Invoice[];

    const supabase = assertSupabase();
    const { data: existingItems, error: existingError } = await supabase
      .from("invoice_line_items")
      .select("id")
      .eq("invoice_id", savedInvoice.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingItems ?? []) as Array<{ id: string }>).map((i) => i.id));
    const submittedIds = new Set(normalizedLineItems.map((i) => i.id).filter((id): id is string => Boolean(id)));

    await Promise.all(
      [...existingIds]
        .filter((id) => !submittedIds.has(id))
        .map((id) => deleteFromTable("invoice_line_items", id)),
    );

    if (normalizedLineItems.length) {
      await upsertTable<InvoiceLineItem>(
        "invoice_line_items",
        normalizedLineItems.map((item) => ({
          ...omitEmptyId(item),
          id: item.id || crypto.randomUUID(),
          invoice_id: savedInvoice.id,
        })),
      );
    }

    await activityService.create({
      event_type: savedInvoice.id === input.invoice.id ? "invoice_updated" : "invoice_created",
      entity_type: "invoice",
      entity_id: savedInvoice.id,
      title: savedInvoice.id === input.invoice.id
        ? `Invoice ${savedInvoice.invoice_number} updated`
        : `Invoice ${savedInvoice.invoice_number} created`,
      description: `${savedInvoice.status} | ${normalizedLineItems.length} line items`,
      metadata: { invoiceId: savedInvoice.id },
    });

    return savedInvoice;
  },

  async updateStatus(id: string, status: InvoiceStatus) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("invoices")
      .update({ status })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    await activityService.create({
      event_type: "invoice_status_updated",
      entity_type: "invoice",
      entity_id: id,
      title: `Invoice status changed to ${status}`,
      description: `Invoice status updated to ${status}.`,
      metadata: { invoiceId: id, status },
    });
    return data as Invoice;
  },

  async convertFromPo(poId: string): Promise<Invoice> {
    const detail = await purchaseOrderService.getById(poId);
    const { purchaseOrder, lineItems } = detail;
    const invoiceNumber = await this.generateInvoiceNumber();

    const invoicePayload: Partial<Invoice> = {
      invoice_number: invoiceNumber,
      source_po_id: poId,
      vendor_id: purchaseOrder.vendor_id,
      retailer_id: purchaseOrder.retailer_id,
      buyer_id: purchaseOrder.buyer_id,
      location_id: purchaseOrder.location_id,
      status: "Draft",
      order_date: purchaseOrder.order_date,
      ship_date: purchaseOrder.ship_date,
      start_ship_date: purchaseOrder.start_ship_date,
      ship_complete_date: purchaseOrder.ship_complete_date,
      eta_date: purchaseOrder.eta_date,
      expected_delivery_date: purchaseOrder.expected_delivery_date,
      actual_delivery_date: purchaseOrder.actual_delivery_date,
      submitted_at: purchaseOrder.submitted_at,
      bill_to_company_name: purchaseOrder.bill_to_company_name,
      bill_to_contact_name: purchaseOrder.bill_to_contact_name,
      bill_to_street: purchaseOrder.bill_to_street,
      bill_to_city: purchaseOrder.bill_to_city,
      bill_to_state: purchaseOrder.bill_to_state,
      bill_to_zip: purchaseOrder.bill_to_zip,
      bill_to_phone: purchaseOrder.bill_to_phone,
      bill_to_email: purchaseOrder.bill_to_email,
      ship_to_company_name: purchaseOrder.ship_to_company_name,
      ship_to_attention: purchaseOrder.ship_to_attention,
      ship_to_street: purchaseOrder.ship_to_street,
      ship_to_city: purchaseOrder.ship_to_city,
      ship_to_state: purchaseOrder.ship_to_state,
      ship_to_zip: purchaseOrder.ship_to_zip,
      ship_to_phone: purchaseOrder.ship_to_phone,
      payment_terms_snapshot: purchaseOrder.payment_terms_snapshot,
      buyer_name_snapshot: purchaseOrder.buyer_name_snapshot,
      approver_name_snapshot: purchaseOrder.approver_name_snapshot,
      subtotal: purchaseOrder.subtotal,
      total_cost: purchaseOrder.total_cost,
      total_units: purchaseOrder.total_units,
      total_retail: purchaseOrder.total_retail,
      currency_code: purchaseOrder.currency_code ?? "USD",
      notes: purchaseOrder.notes,
      buyer_notes: purchaseOrder.buyer_notes,
      source_channel: "Converted from PO",
    };

    const invoiceLineItems: Array<Partial<InvoiceLineItem>> = lineItems.map((item, index) => ({
      sku: item.sku,
      upc: item.upc,
      product_name: item.product_name,
      product_id: item.product_id,
      variant_label: item.variant_label,
      description: item.description,
      unit: item.unit,
      case_pack_quantity: item.case_pack_quantity,
      case_quantity: item.case_quantity,
      unit_quantity: item.unit_quantity,
      quantity_ordered: item.quantity_ordered,
      quantity_received: item.quantity_received,
      unit_cost: item.unit_cost,
      unit_retail: item.unit_retail,
      line_total: item.line_total,
      extended_cost: item.extended_cost,
      extended_retail: item.extended_retail,
      sort_order: item.sort_order ?? index,
    }));

    const savedInvoice = await this.save({ invoice: invoicePayload, lineItems: invoiceLineItems });

    await activityService.create({
      event_type: "invoice_converted_from_po",
      entity_type: "invoice",
      entity_id: savedInvoice.id,
      title: `Invoice ${invoiceNumber} created from PO ${purchaseOrder.po_number}`,
      description: `Converted from Purchase Order ${purchaseOrder.po_number}.`,
      metadata: { invoiceId: savedInvoice.id, sourcePurchaseOrderId: poId },
    });

    return savedInvoice;
  },

  async remove(id: string) {
    await deleteFromTable("invoices", id);
    await activityService.create({
      event_type: "invoice_deleted",
      entity_type: "invoice",
      entity_id: id,
      title: "Invoice deleted",
      description: "An invoice and its line items were removed.",
      metadata: { invoiceId: id },
    });
  },
};
