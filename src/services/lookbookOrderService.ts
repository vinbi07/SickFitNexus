import { assertSupabase } from "@/lib/supabase";
import { buyerService } from "@/services/buyerService";
import { complianceService } from "@/services/complianceService";
import { inventoryService } from "@/services/inventoryService";
import { lookbookAnalyticsService } from "@/services/lookbookAnalyticsService";
import { insertTable } from "@/services/baseService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  Buyer,
  LookbookOrderInputLine,
  PoLineItem,
  Product,
  PurchaseOrder,
  PurchaseOrderCounterEvent,
  PurchaseOrderNotification,
  Retailer,
} from "@/types/domain";
import {
  buildComplianceSnapshot,
  buildLineItemFromProduct,
  calculateLookbookTotals,
  deriveInventoryAvailable,
  resolveCasePackQuantity,
  sortProductsByFamily,
  validateLookbookSelection,
} from "@/utils/lookbook";

async function attachParentProducts(products: Product[]) {
  const parentIds = [...new Set(products.map((product) => product.parent_product_id).filter(Boolean))] as string[];
  if (!parentIds.length) {
    return products.map((product) => ({ ...product, parent_products: null }));
  }

  const supabase = assertSupabase();
  const { data: parentRows, error: parentError } = await supabase
    .from("products")
    .select("*")
    .in("id", parentIds);
  if (parentError) throw parentError;

  const parentsById = new Map(((parentRows ?? []) as Product[]).map((product) => [product.id, product]));
  return products.map((product) => ({
    ...product,
    parent_products: product.parent_product_id ? parentsById.get(product.parent_product_id) ?? null : null,
  }));
}

async function listWholesaleProducts(templateId?: string | null) {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("*, vendors:vendors!products_vendor_id_fkey(*), product_barcode_links(*, product_barcodes(*))")
    .gt("case_pack_quantity", 0)
    .order("name", { ascending: true });
  if (error) throw error;
  let products = await attachParentProducts((data ?? []) as Product[]);

  if (templateId) {
    const { data: templateItems, error: templateError } = await supabase
      .from("lookbook_template_items")
      .select("product_id")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true });
    if (templateError) throw templateError;
    const allowedIds = new Set(((templateItems ?? []) as Array<{ product_id: string }>).map((item) => item.product_id));
    products = products.filter((product) => allowedIds.has(product.id));
  }

  return sortProductsByFamily(
    products.map((product) => ({
      ...product,
      inventory_available: deriveInventoryAvailable(product),
    })),
  );
}

async function generatePoNumber() {
  const supabase = assertSupabase();
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SF-${dateStamp}`;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number")
    .ilike("po_number", `${prefix}%`);
  if (error) throw error;
  const sequence = String((data ?? []).length + 1).padStart(3, "0");
  return `${prefix}-${sequence}`;
}

async function buildOrderContextFromBuyer(buyer: Buyer) {
  const products = await listWholesaleProducts(buyer.lookbook_template_id);
  const supabase = assertSupabase();
  const { data: retailerData, error: retailerError } = await supabase
    .from("retailers")
    .select("*")
    .eq("id", buyer.retailer_id)
    .single();
  if (retailerError) throw retailerError;
  const retailer = retailerData as Retailer;

  const isExpired = Boolean(
    buyer.token_expires_at && new Date(buyer.token_expires_at).getTime() < Date.now(),
  );

  const existingDraftResponse = await supabase
    .from("purchase_orders")
    .select("*, buyers(*), retailers(*), locations(*), vendors(*)")
    .eq("buyer_id", buyer.id)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (existingDraftResponse.error) throw existingDraftResponse.error;
  const existingDraft =
    ((existingDraftResponse.data ?? []) as PurchaseOrder[]).find((purchaseOrder) =>
      !["Fulfilled", "Cancelled", "Closed"].includes(purchaseOrder.status),
    ) ?? null;

  let existingDraftLineItems: PoLineItem[] = [];
  let counterEvents: PurchaseOrderCounterEvent[] = [];
  if (existingDraft?.id) {
    const [{ data: lineItemsData, error: lineItemsError }, { data: counterEventData, error: counterEventError }] = await Promise.all([
      supabase.from("po_line_items").select("*").eq("purchase_order_id", existingDraft.id).order("created_at", { ascending: true }),
      supabase.from("purchase_order_counter_events").select("*").eq("purchase_order_id", existingDraft.id).order("created_at", { ascending: false }),
    ]);
    if (lineItemsError) throw lineItemsError;
    if (counterEventError) throw counterEventError;
    existingDraftLineItems = (lineItemsData ?? []) as PoLineItem[];
    counterEvents = (counterEventData ?? []) as PurchaseOrderCounterEvent[];
  }

  return {
    buyer,
    retailer,
    products,
    existingDraft,
    existingDraftLineItems,
    counterEvents,
    expired: isExpired,
  };
}

async function buildOrderContext(token: string) {
  const buyer = await buyerService.getByToken(token);
  return buildOrderContextFromBuyer(buyer);
}

async function buildComplianceForSelection(buyer: Buyer, products: Product[]) {
  const retailerRequirements = await complianceService.listRequirements();
  const buyerRequirements = retailerRequirements
    .filter((requirement) => requirement.retailer_id === buyer.retailer_id)
    .map((requirement) => ({
      requirementName: requirement.requirement_types?.name ?? "Compliance requirement",
      status: requirement.status,
    }));

  return buildComplianceSnapshot({
    buyer,
    retailerRequirementStatuses: buyerRequirements,
    productRequirements: products.map((product) => ({
      productId: product.id,
      sku: product.sku,
      requiredDocs: product.compliance_docs_status === "Missing"
        ? product.compliance_docs_required
        : [],
    })),
  });
}

async function queueNotifications(purchaseOrder: PurchaseOrder, buyer: Buyer, retailer: Retailer) {
  const payloads: Array<Partial<PurchaseOrderNotification>> = [
    {
      purchase_order_id: purchaseOrder.id,
      recipient_type: "buyer",
      recipient_name: buyer.buyer_name,
      recipient_email: buyer.buyer_email,
      notification_type: "buyer_confirmation",
      subject: `SickFit order confirmation ${purchaseOrder.po_number}`,
      body: `Order submitted for ${retailer.name}. PO ${purchaseOrder.po_number} totals ${purchaseOrder.total_units} units and ${purchaseOrder.subtotal}.`,
      payload: {
        poNumber: purchaseOrder.po_number,
        buyerName: buyer.buyer_name,
        retailerName: retailer.name,
        totalUnits: purchaseOrder.total_units,
        subtotal: purchaseOrder.subtotal,
      },
    },
    {
      purchase_order_id: purchaseOrder.id,
      recipient_type: "internal",
      recipient_name: buyer.assigned_sales_rep ?? "SickFit Team",
      recipient_email: null,
      notification_type: "internal_pending_approval",
      subject: `Pending approval ${purchaseOrder.po_number}`,
      body: `${buyer.buyer_name} from ${retailer.name} submitted ${purchaseOrder.total_units} units for approval.`,
      payload: {
        poId: purchaseOrder.id,
        poNumber: purchaseOrder.po_number,
        buyerName: buyer.buyer_name,
        retailerName: retailer.name,
        totalUnits: purchaseOrder.total_units,
        subtotal: purchaseOrder.subtotal,
      },
    },
  ];
  await insertTable<PurchaseOrderNotification>("purchase_order_notifications", payloads);
}

export const lookbookOrderService = {
  async loadByToken(token: string) {
    const context = await buildOrderContext(token);
    await lookbookAnalyticsService.trackEvent({
      buyer: context.buyer,
      retailer: context.retailer,
      eventType: "opened",
      metadata: {
        expired: context.expired,
        hasDraft: Boolean(context.existingDraft),
      },
    });
    return context;
  },

  async loadPreviewByBuyerId(buyerId: string) {
    const buyer = await buyerService.getById(buyerId);
    return buildOrderContextFromBuyer(buyer);
  },

  async save(token: string, lines: LookbookOrderInputLine[], action: "draft" | "quote" | "submit", notes?: string) {
    const { buyer, retailer, products, existingDraft } = await buildOrderContext(token);
    if (buyer.token_expires_at && new Date(buyer.token_expires_at).getTime() < Date.now()) {
      throw new Error("This lookbook link has expired.");
    }
    const orderingDisabled = !buyer.order_mode_enabled || retailer.order_mode_policy !== "enabled" || retailer.edi_required;
    if (action === "submit" && orderingDisabled) {
      throw new Error("This retailer must submit purchase orders through the normal channel.");
    }
    if (action === "submit") {
      buyerService.validateProfile(buyer);
    }
    validateLookbookSelection(lines, products, { enforceInventory: action === "submit" });

    const selectedProducts = lines.map((line) => {
      const product = products.find((entry) => entry.id === line.product_id);
      if (!product) throw new Error(`Product ${line.sku} is no longer available.`);
      return { product, caseQuantity: line.requested_case_quantity };
    });
    const lineItems = selectedProducts.map(({ product, caseQuantity }) => buildLineItemFromProduct(product, caseQuantity));
    const totals = calculateLookbookTotals(
      lineItems.map((line) => ({
        sku: String(line.sku ?? ""),
        unit_quantity: Number(line.unit_quantity ?? 0),
        extended_cost: Number(line.extended_cost ?? 0),
        extended_retail: Number(line.extended_retail ?? 0),
      })),
    );
    const complianceSnapshot = await buildComplianceForSelection(buyer, selectedProducts.map(({ product }) => product));

    const hasComplianceGap = action === "submit" && complianceSnapshot.missingDocs.length > 0;

    const purchaseOrderPayload: Partial<PurchaseOrder> = {
      id: existingDraft?.id,
      po_number:
        action === "submit" && existingDraft?.requested_action === "submit"
          ? existingDraft.po_number
          : action === "submit"
            ? await generatePoNumber()
            : existingDraft?.po_number ?? `DRAFT-${await generatePoNumber()}`,
      retailer_id: buyer.retailer_id,
      buyer_id: buyer.id,
      po_type: "Retailer PO",
      status: action === "submit" ? (hasComplianceGap ? "On Hold" : "Pending Approval") : "Draft",
      approval_status: action === "submit" ? "Pending Approval" : "Not Requested",
      allocation_status: action === "submit" ? "Allocated" : "Not Allocated",
      order_date: new Date().toISOString().slice(0, 10),
      submitted_at: action === "submit" ? new Date().toISOString() : existingDraft?.submitted_at ?? null,
      ship_date: null,
      start_ship_date: null,
      ship_complete_date: null,
      source_channel: "Lookbook",
      currency_code: "USD",
      compliance_snapshot: complianceSnapshot as unknown as Record<string, unknown>,
      buyer_notes: notes ?? null,
      internal_notes: existingDraft?.internal_notes ?? null,
      hold_reason: hasComplianceGap ? `Missing compliance docs: ${complianceSnapshot.missingDocs.join(", ")}` : null,
      counter_status: existingDraft?.status === "Countered" ? "Accepted" : existingDraft?.counter_status ?? "None",
      requested_action: action,
      subtotal: totals.subtotal,
      total_units: totals.totalUnits,
      total_retail: totals.totalRetail,
      total_cost: totals.subtotal,
      notes: notes ?? null,
    };

    const supabase = assertSupabase();
    const { data: savedRows, error: saveError } = await supabase
      .from("purchase_orders")
      .upsert(purchaseOrderPayload)
      .select("*");
    if (saveError) throw saveError;
    const savedPo = (savedRows?.[0] ?? null) as PurchaseOrder | null;
    if (!savedPo) throw new Error("Unable to save the order.");

    if (existingDraft?.id && existingDraft.id !== savedPo.id) {
      await supabase.from("po_line_items").delete().eq("purchase_order_id", existingDraft.id);
    }
    await supabase.from("po_line_items").delete().eq("purchase_order_id", savedPo.id);
    const savedLineItems = lineItems.map((line) => ({
      ...line,
      purchase_order_id: savedPo.id,
    }));
    const { error: lineItemError } = await supabase.from("po_line_items").insert(savedLineItems);
    if (lineItemError) throw lineItemError;

    if (action === "submit") {
      await inventoryService.allocateProducts(
        selectedProducts.map(({ product, caseQuantity }) => ({
          productId: product.id,
          units: caseQuantity * resolveCasePackQuantity(product),
        })),
      );
      if (hasComplianceGap) {
        await purchaseOrderService.saveComplianceHold({
          purchase_order_id: savedPo.id,
          buyer_id: buyer.id,
          retailer_id: retailer.id,
          status: "Open",
          summary: "Buyer submission is waiting on compliance review.",
          missing_docs: complianceSnapshot.missingDocs,
          notes: notes ?? null,
        });
      }
      await queueNotifications(savedPo, buyer, retailer);
    }

    await lookbookAnalyticsService.trackEvent({
      buyer,
      retailer,
      eventType: action === "draft" ? "draft_saved" : action === "quote" ? "quote_requested" : "submitted",
      metadata: {
        purchaseOrderId: savedPo.id,
        totalUnits: savedPo.total_units,
        skuCount: lines.length,
      },
    });

    if (existingDraft?.status === "Countered" && action === "submit") {
      await insertTable("purchase_order_counter_events", {
        purchase_order_id: savedPo.id,
        actor_user_id: null,
        actor_label: buyer.buyer_name,
        event_type: "buyer_revised",
        notes: notes ?? null,
        payload: {
          buyerId: buyer.id,
          skuCount: lines.length,
          totalUnits: savedPo.total_units,
          subtotal: savedPo.subtotal,
        },
      });
    }

    return savedPo;
  },
};
