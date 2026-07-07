import { assertSupabase } from "@/lib/supabase";
import { buyerService } from "@/services/buyerService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type { Buyer, Product, PurchaseOrder } from "@/types/domain";
import { hasLookbookAlreadyGeneratedPO, mapLookbookItemsToPOLineItems, validateLookbookBeforePOCreation } from "@/utils/lookbook";

async function listLookbookPurchaseOrders() {
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("source_channel", "Lookbook")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PurchaseOrder[];
}

export const lookbookService = {
  async listLookbooks() {
    const [buyers, purchaseOrders] = await Promise.all([buyerService.list(), listLookbookPurchaseOrders()]);
    const purchaseOrdersByBuyer = new Map<string, PurchaseOrder[]>();
    purchaseOrders.forEach((po) => {
      if (!po.buyer_id) return;
      const existing = purchaseOrdersByBuyer.get(po.buyer_id) ?? [];
      existing.push(po);
      purchaseOrdersByBuyer.set(po.buyer_id, existing);
    });

    return buyers.map((buyer) => ({
      buyer,
      purchaseOrders: purchaseOrdersByBuyer.get(buyer.id) ?? [],
    }));
  },

  async getExistingLookbookOrder(buyerId: string) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("buyer_id", buyerId)
      .eq("source_channel", "Lookbook")
      .order("updated_at", { ascending: false })
      .limit(5);
    if (error) throw error;
    const purchaseOrders = (data ?? []) as PurchaseOrder[];
    return hasLookbookAlreadyGeneratedPO(purchaseOrders) ? purchaseOrders[0] : null;
  },

  async createDraftPurchaseOrderFromLookbook(
    buyer: Buyer,
    lines: Array<{ product: Product; caseQuantity: number }>,
  ) {
    validateLookbookBeforePOCreation(
      lines.map((line) => ({
        product_id: line.product.id,
        sku: line.product.sku,
        requested_case_quantity: line.caseQuantity,
      })),
      lines.map((line) => line.product),
    );

    const lineItems = mapLookbookItemsToPOLineItems(lines);
    const totalCost = lineItems.reduce((sum, item) => sum + Number(item.extended_cost ?? 0), 0);
    const totalUnits = lineItems.reduce((sum, item) => sum + Number(item.unit_quantity ?? 0), 0);
    const totalRetail = lineItems.reduce((sum, item) => sum + Number(item.extended_retail ?? 0), 0);
    const poNumber = await purchaseOrderService.generatePoNumber();

    const savedPo = await purchaseOrderService.savePurchaseOrder({
      purchaseOrder: {
        po_number: poNumber,
        retailer_id: buyer.retailer_id,
        buyer_id: buyer.id,
        po_type: "Retailer PO",
        status: "Draft",
        approval_status: "Not Requested",
        allocation_status: "Not Allocated",
        source_channel: "Lookbook",
        order_date: new Date().toISOString().slice(0, 10),
        currency_code: "USD",
        subtotal: totalCost,
        total_cost: totalCost,
        total_units: totalUnits,
        total_retail: totalRetail,
        buyer_notes: null,
      },
      lineItems,
    });

    return savedPo;
  },
};
