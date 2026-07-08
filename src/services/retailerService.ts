import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, updateTable, upsertTable } from "@/services/baseService";
import type {
  Buyer,
  LookbookTemplate,
  LookbookView,
  PoLineItem,
  Product,
  PurchaseOrder,
  Retailer,
  RetailerBuyerAnalytics,
  RetailerLookbookActivity,
} from "@/types/domain";
import { addDays, toDateInput } from "@/utils/date";
import { getInvoiceStatus } from "@/utils/operations";

function toRetailerWritePayload(payload: Partial<Retailer>): Partial<Retailer> {
  return {
    id: payload.id,
    name: payload.name,
    status: payload.status,
    primary_contact_name: payload.primary_contact_name,
    primary_contact_email: payload.primary_contact_email,
    primary_contact_phone: payload.primary_contact_phone,
    secondary_contacts: payload.secondary_contacts,
    account_number: payload.account_number,
    supplier_id: payload.supplier_id,
    activation_id: payload.activation_id,
    shipping_requirements: payload.shipping_requirements,
    billing_company_name: payload.billing_company_name,
    billing_contact_name: payload.billing_contact_name,
    billing_street: payload.billing_street,
    billing_city: payload.billing_city,
    billing_state: payload.billing_state,
    billing_zip: payload.billing_zip,
    billing_phone: payload.billing_phone,
    billing_email: payload.billing_email,
    shipping_company_name: payload.shipping_company_name,
    shipping_attention: payload.shipping_attention,
    shipping_street: payload.shipping_street,
    shipping_city: payload.shipping_city,
    shipping_state: payload.shipping_state,
    shipping_zip: payload.shipping_zip,
    shipping_phone: payload.shipping_phone,
    sop_notes: payload.sop_notes,
    parent_retailer_id: payload.parent_retailer_id,
    retailer_group: payload.retailer_group,
    logo_url: payload.logo_url,
    brand_accent_color: payload.brand_accent_color,
    lookbook_intro: payload.lookbook_intro,
    default_payment_terms: payload.default_payment_terms,
    order_mode_policy: payload.order_mode_policy,
    edi_required: payload.edi_required,
    ordering_cadence_days: payload.ordering_cadence_days,
    next_reorder_start: payload.next_reorder_start,
    next_reorder_end: payload.next_reorder_end,
    notes: payload.notes,
  };
}

function calculateCadence(purchaseOrders: PurchaseOrder[]) {
  const ordered = purchaseOrders
    .map((po) => po.order_date)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right));

  if (ordered.length < 2) return null;

  const deltas: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = new Date(ordered[index - 1]);
    const current = new Date(ordered[index]);
    deltas.push(Math.round((current.getTime() - previous.getTime()) / 86400000));
  }

  return Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
}

export const retailerService = {
  async list() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from("retailers").select("*").order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Retailer[];
  },

  async upsert(payload: Partial<Retailer>) {
    const [saved] = (await upsertTable<Retailer>("retailers", toRetailerWritePayload(payload))) as Retailer[];
    return saved;
  },

  remove: (id: string) => deleteFromTable("retailers", id),

  updateLogo: (id: string, logoUrl: string | null) =>
    updateTable<Retailer>("retailers", id, { logo_url: logoUrl }),

  updateAddresses: (
    id: string,
    payload: Pick<
      Retailer,
      | "billing_company_name"
      | "billing_contact_name"
      | "billing_street"
      | "billing_city"
      | "billing_state"
      | "billing_zip"
      | "billing_phone"
      | "billing_email"
      | "shipping_company_name"
      | "shipping_attention"
      | "shipping_street"
      | "shipping_city"
      | "shipping_state"
      | "shipping_zip"
      | "shipping_phone"
    >,
  ) => updateTable<Retailer>("retailers", id, payload),

  async getSnapshots() {
    const supabase = assertSupabase();
    const [retailersResponse, purchaseOrdersResponse, locationsResponse, requirementsResponse] = await Promise.all([
      supabase.from("retailers").select("*").order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*").not("retailer_id", "is", null),
      supabase.from("locations").select("*"),
      supabase.from("retailer_compliance_requirements").select("*"),
    ]);

    if (retailersResponse.error) throw retailersResponse.error;
    if (purchaseOrdersResponse.error) throw purchaseOrdersResponse.error;
    if (locationsResponse.error) throw locationsResponse.error;
    if (requirementsResponse.error) throw requirementsResponse.error;

    const retailers = (retailersResponse.data ?? []) as Retailer[];
    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const locations = (locationsResponse.data ?? []) as Array<{ id: string; retailer_id: string | null }>;
    const requirements = (requirementsResponse.data ?? []) as Array<{ retailer_id: string; status: string }>;

    return retailers.map((retailer) => {
      const retailerOrders = purchaseOrders.filter((po) => po.retailer_id === retailer.id);
      const cadence = retailer.ordering_cadence_days ?? calculateCadence(retailerOrders);
      const lastOrderDate = retailerOrders
        .map((po) => po.order_date)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);

      const reorderStart = cadence && lastOrderDate ? toDateInput(addDays(new Date(lastOrderDate), cadence - 4)) : retailer.next_reorder_start;
      const reorderEnd = cadence && lastOrderDate ? toDateInput(addDays(new Date(lastOrderDate), cadence + 3)) : retailer.next_reorder_end;

      return {
        ...retailer,
        ordering_cadence_days: cadence,
        next_reorder_start: reorderStart,
        next_reorder_end: reorderEnd,
        totalPos: retailerOrders.length,
        totalSpend: retailerOrders.reduce((sum, po) => sum + po.total_cost, 0),
        activeLocations: locations.filter((location) => location.retailer_id === retailer.id).length,
        compliantRequirements: requirements.filter((requirement) => requirement.retailer_id === retailer.id && requirement.status === "Compliant").length,
        atRiskRequirements: requirements.filter((requirement) => requirement.retailer_id === retailer.id && requirement.status !== "Compliant").length,
      };
    });
  },

  async getProfile(id: string) {
    const supabase = assertSupabase();
    const [
      retailerResponse,
      retailersResponse,
      locationsResponse,
      purchaseOrdersResponse,
      lineItemsResponse,
      productsResponse,
      buyersResponse,
      templatesResponse,
      lookbookViewsResponse,
    ] = await Promise.all([
      supabase.from("retailers").select("*").eq("id", id).single(),
      supabase.from("retailers").select("*").order("name", { ascending: true }),
      supabase.from("locations").select("*").eq("retailer_id", id).order("name", { ascending: true }),
      supabase.from("purchase_orders").select("*").eq("retailer_id", id).order("order_date", { ascending: false }),
      supabase.from("po_line_items").select("*"),
      supabase.from("products").select("*"),
      supabase.from("buyers").select("*, lookbook_templates(*)").eq("retailer_id", id).order("buyer_name", { ascending: true }),
      supabase.from("lookbook_templates").select("*").order("name", { ascending: true }),
      supabase.from("lookbook_views").select("*").eq("retailer_id", id).order("created_at", { ascending: false }),
    ]);

    if (retailerResponse.error) throw retailerResponse.error;
    if (retailersResponse.error) throw retailersResponse.error;
    if (locationsResponse.error) throw locationsResponse.error;
    if (purchaseOrdersResponse.error) throw purchaseOrdersResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    if (productsResponse.error) throw productsResponse.error;
    if (buyersResponse.error) throw buyersResponse.error;
    if (templatesResponse.error) throw templatesResponse.error;
    if (lookbookViewsResponse.error) throw lookbookViewsResponse.error;

    const retailer = retailerResponse.data as Retailer;
    const allRetailers = (retailersResponse.data ?? []) as Retailer[];
    const siblingLocations = (locationsResponse.data ?? []) as Array<{ id: string; name: string; address: string | null }>;
    const purchaseOrders = (purchaseOrdersResponse.data ?? []) as PurchaseOrder[];
    const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];
    const products = (productsResponse.data ?? []) as Product[];
    const buyers = (buyersResponse.data ?? []) as Buyer[];
    const lookbookTemplates = (templatesResponse.data ?? []) as LookbookTemplate[];
    const lookbookViews = (lookbookViewsResponse.data ?? []) as LookbookView[];
    const productById = new Map(products.map((product) => [product.id, product]));
    const buyersById = new Map(buyers.map((buyer) => [buyer.id, buyer]));
    const lineItemsByPo = new Map<string, PoLineItem[]>();
    lineItems.forEach((item) => {
      const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
      current.push(item);
      lineItemsByPo.set(item.purchase_order_id, current);
    });

    const topSkuMap = new Map<string, { sku: string; name: string; units: number; revenue: number }>();
    purchaseOrders.forEach((po) => {
      (lineItemsByPo.get(po.id) ?? []).forEach((item) => {
        const product = item.product_id ? productById.get(item.product_id) : null;
        const current = topSkuMap.get(item.sku) ?? {
          sku: item.sku,
          name: item.product_name,
          units: 0,
          revenue: 0,
        };
        current.units += Number(item.quantity_ordered ?? 0);
        current.revenue += Number(item.quantity_ordered ?? 0) * Number(product?.unit_price ?? item.unit_cost ?? 0);
        topSkuMap.set(item.sku, current);
      });
    });

    const openInvoices = purchaseOrders.filter((po) => getInvoiceStatus(po) === "Open");
    const shippedInvoices = purchaseOrders.filter((po) => getInvoiceStatus(po) === "Shipped");
    const inRouteInvoices = purchaseOrders.filter((po) => ["In Route", "Inventory in Route"].includes(getInvoiceStatus(po)));
    const parentRetailer = retailer.parent_retailer_id
      ? allRetailers.find((entry) => entry.id === retailer.parent_retailer_id) ?? null
      : null;
    const childRetailers = allRetailers.filter((entry) => entry.parent_retailer_id === retailer.id);
    const purchaseOrdersByBuyer = new Map<string, PurchaseOrder[]>();
    purchaseOrders.forEach((po) => {
      if (!po.buyer_id) return;
      const current = purchaseOrdersByBuyer.get(po.buyer_id) ?? [];
      current.push(po);
      purchaseOrdersByBuyer.set(po.buyer_id, current);
    });

    const buyerAnalytics: RetailerBuyerAnalytics[] = buyers.map((buyer) => {
      const views = lookbookViews.filter((view) => view.buyer_id === buyer.id);
      const activeOrder = (purchaseOrdersByBuyer.get(buyer.id) ?? [])
        .slice()
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

      return {
        buyerId: buyer.id,
        buyerName: buyer.buyer_name,
        buyerEmail: buyer.buyer_email,
        orderModeEnabled: buyer.order_mode_enabled,
        linkValidityDays: buyer.link_validity_days,
        lastViewedAt: views.find((view) => view.event_type === "opened")?.created_at ?? buyer.last_accessed_at ?? null,
        totalViews: views.filter((view) => view.event_type === "opened").length,
        totalDraftSaves: views.filter((view) => view.event_type === "draft_saved").length,
        totalQuoteRequests: views.filter((view) => view.event_type === "quote_requested").length,
        totalSubmissions: views.filter((view) => view.event_type === "submitted").length,
        activeOrderStatus: activeOrder?.status ?? null,
        activeOrderUpdatedAt: activeOrder?.updated_at ?? null,
      };
    }).sort((left, right) => {
      const leftViews = left.lastViewedAt ?? "";
      const rightViews = right.lastViewedAt ?? "";
      return rightViews.localeCompare(leftViews);
    });

    const recentLookbookActivity: RetailerLookbookActivity[] = lookbookViews.slice(0, 12).map((view) => {
      const buyer = view.buyer_id ? buyersById.get(view.buyer_id) : null;
      return {
        buyerId: view.buyer_id,
        buyerName: buyer?.buyer_name ?? "Unknown buyer",
        buyerEmail: buyer?.buyer_email ?? null,
        eventType: view.event_type,
        createdAt: view.created_at,
        metadata: view.metadata ?? {},
      };
    });

    return {
      retailer,
      parentRetailer,
      childRetailers,
      buyers,
      lookbookTemplates,
      locations: siblingLocations,
      purchaseOrders,
      openInvoices,
      shippedInvoices,
      inRouteInvoices,
      lookbookAnalytics: {
        totalViews: lookbookViews.filter((view) => view.event_type === "opened").length,
        totalDraftSaves: lookbookViews.filter((view) => view.event_type === "draft_saved").length,
        totalQuoteRequests: lookbookViews.filter((view) => view.event_type === "quote_requested").length,
        totalSubmissions: lookbookViews.filter((view) => view.event_type === "submitted").length,
        lastViewedAt: lookbookViews.find((view) => view.event_type === "opened")?.created_at ?? null,
      },
      buyerAnalytics,
      recentLookbookActivity,
      topSkus: [...topSkuMap.values()].sort((left, right) => right.units - left.units).slice(0, 8),
      recentPos: purchaseOrders.slice(0, 8),
    };
  },
};
