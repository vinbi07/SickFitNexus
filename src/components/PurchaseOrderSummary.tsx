import type { PurchaseOrder } from "@/types/domain";
import { formatCurrency } from "@/utils/format";

export function PurchaseOrderSummary({
  purchaseOrder,
  lineItemCount,
}: {
  purchaseOrder: PurchaseOrder;
  lineItemCount: number;
}) {
  return (
    <div className="po-drawer-section">
      <div className="detail-grid">
        <div className="detail-card">
          <span>Number of Products</span>
          <strong>{lineItemCount}</strong>
        </div>
        <div className="detail-card">
          <span>Total Quantity</span>
          <strong>{purchaseOrder.total_units}</strong>
        </div>
        <div className="detail-card">
          <span>Total Cost</span>
          <strong>{formatCurrency(purchaseOrder.total_cost)}</strong>
        </div>
        <div className="detail-card">
          <span>Total Suggested Retail</span>
          <strong>{formatCurrency(purchaseOrder.total_retail)}</strong>
        </div>
        <div className="detail-card">
          <span>Final Total</span>
          <strong>{formatCurrency(purchaseOrder.subtotal)}</strong>
        </div>
      </div>
      <span className="helper-text">Read-only. Open the full purchase order to edit products, quantities, or pricing.</span>
    </div>
  );
}
