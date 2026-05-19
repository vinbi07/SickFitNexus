import type { PoLineItem, PurchaseOrder } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";

export function PurchaseOrderDocumentView({
  purchaseOrder,
  lineItems,
}: {
  purchaseOrder: PurchaseOrder;
  lineItems: PoLineItem[];
}) {
  return (
    <div className="po-document">
      <div className="po-document-header">
        <div>
          <p className="po-document-kicker">SickFit</p>
          <h2>Purchase Order</h2>
          <span>{purchaseOrder.po_number}</span>
        </div>
        <div className="po-document-meta">
          <div><span>Order Date</span><strong>{formatDate(purchaseOrder.order_date)}</strong></div>
          <div><span>Start Ship</span><strong>{formatDate(purchaseOrder.start_ship_date ?? purchaseOrder.ship_date)}</strong></div>
          <div><span>Ship Complete</span><strong>{formatDate(purchaseOrder.ship_complete_date ?? purchaseOrder.expected_delivery_date)}</strong></div>
          <div><span>Currency</span><strong>USD</strong></div>
        </div>
      </div>
      <div className="po-address-grid">
        <div className="detail-card">
          <span>Bill To</span>
          <strong>{purchaseOrder.buyers?.company_name ?? purchaseOrder.retailers?.name ?? "Retailer"}</strong>
          <p>{purchaseOrder.buyers?.billing_address ?? "No billing address on file"}</p>
        </div>
        <div className="detail-card">
          <span>Ship To</span>
          <strong>{purchaseOrder.buyers?.buyer_name ?? "Buyer"}</strong>
          <p>{purchaseOrder.buyers?.shipping_address ?? "No shipping address on file"}</p>
        </div>
        <div className="detail-card">
          <span>Terms</span>
          <strong>{purchaseOrder.buyers?.payment_terms ?? "Net terms not set"}</strong>
          <p>{purchaseOrder.source_channel ?? "Lookbook"}</p>
        </div>
        <div className="detail-card">
          <span>Approver</span>
          <strong>{purchaseOrder.approved_by ?? "Pending approval"}</strong>
          <p>{purchaseOrder.buyers?.assigned_sales_rep ?? "SickFit Team"}</p>
        </div>
      </div>
      <div className="table-shell po-document-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Description</th>
              <th>UPC</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Unit Cost</th>
              <th>Extended Cost</th>
              <th>Unit Retail</th>
              <th>Extended Retail</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={item.id}>
                <td>{index + 1}</td>
                <td>{item.sku}</td>
                <td>{item.description ?? item.product_name}</td>
                <td>{item.upc ?? "N/A"}</td>
                <td>{item.unit}</td>
                <td>{item.unit_quantity}</td>
                <td>{formatCurrency(item.unit_cost)}</td>
                <td>{formatCurrency(item.extended_cost || item.line_total)}</td>
                <td>{formatCurrency(item.unit_retail)}</td>
                <td>{formatCurrency(item.extended_retail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="po-document-footer">
        <div className="detail-card">
          <span>Notes</span>
          <strong>{purchaseOrder.buyer_notes ?? purchaseOrder.notes ?? "No notes provided."}</strong>
        </div>
        <div className="po-total-card">
          <div><span>Total Units</span><strong>{purchaseOrder.total_units}</strong></div>
          <div><span>Total Cost</span><strong>{formatCurrency(purchaseOrder.subtotal || purchaseOrder.total_cost)}</strong></div>
          <div><span>Total Retail</span><strong>{formatCurrency(purchaseOrder.total_retail)}</strong></div>
        </div>
      </div>
    </div>
  );
}
