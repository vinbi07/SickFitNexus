import { Link, useParams } from "react-router-dom";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { supportService } from "@/services/supportService";
import { formatCurrency, formatDate } from "@/utils/format";
import { getInventoryHealthLabel } from "@/utils/operations";

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const { data, loading, error } = useAsyncData(() => supportService.getProductDetail(id), [id]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load product detail"} />;

  const { product, events, reservations, poLineItems } = data;

  return (
    <div className="section-stack">
      <PageHeader
        title={`${product.sku} | ${product.name}`}
        description="SKU detail with Shopify links, pricing, compliance, reservation state, and recent order history."
        actions={product.shopify_admin_url ? <a className="btn btn-secondary" href={product.shopify_admin_url} target="_blank" rel="noreferrer">Open Shopify</a> : undefined}
      />
      <div className="detail-grid">
        <div className="detail-card"><span>Inventory</span><strong>{product.current_inventory}</strong></div>
        <div className="detail-card"><span>Available</span><strong>{product.inventory_available}</strong></div>
        <div className="detail-card"><span>Allocated</span><strong>{product.inventory_allocated}</strong></div>
        <div className="detail-card"><span>Health</span><strong>{getInventoryHealthLabel(product.current_inventory, product.safety_stock)}</strong></div>
        <div className="detail-card"><span>UPC</span><strong>{product.upc ?? "N/A"}</strong></div>
        <div className="detail-card"><span>Case Pack</span><strong>{product.case_pack_quantity}</strong></div>
        <div className="detail-card"><span>Wholesale</span><strong>{formatCurrency(product.wholesale_price)}</strong></div>
        <div className="detail-card"><span>MSRP</span><strong>{formatCurrency(product.msrp)}</strong></div>
        <div className="detail-card"><span>Dimensions</span><strong>{product.dimensions ?? "N/A"}</strong></div>
        <div className="detail-card"><span>Weight</span><strong>{product.weight ?? "N/A"}</strong></div>
        <div className="detail-card"><span>Compliance</span><strong>{product.compliance_docs_status ?? "N/A"}</strong></div>
        <div className="detail-card"><span>Storefront</span><strong>{product.shopify_storefront_url ? <a href={product.shopify_storefront_url} target="_blank" rel="noreferrer">Open</a> : "N/A"}</strong></div>
        <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Compliance Docs Required</span><strong>{product.compliance_docs_required?.join(", ") || "None"}</strong></div>
      </div>

      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Reservations</h3></div>
          <DataTable
            emptyMessage="No active reservation history for this SKU."
            columns={[
              { key: "purchase_order_id", title: "PO", render: (row) => <Link className="table-link" to={`/purchase-orders/${row.purchase_order_id}`}>{row.purchase_order_id.slice(0, 8)}</Link> },
              { key: "reserved_units", title: "Units", render: (row) => row.reserved_units },
              { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
              { key: "actor_label", title: "Actor", render: (row) => row.actor_label ?? "Buyer flow" },
              { key: "created_at", title: "Updated", render: (row) => formatDate(row.updated_at) },
            ]}
            rows={reservations}
          />
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Linked POs</h3></div>
          <DataTable
            emptyMessage="No purchase orders reference this SKU yet."
            columns={[
              { key: "purchase_orders", title: "PO", render: (row) => row.purchase_orders?.id ? <Link className="table-link" to={`/purchase-orders/${row.purchase_orders.id}`}>{row.purchase_orders.po_number}</Link> : "N/A" },
              { key: "variant_label", title: "Variant", render: (row) => row.variant_label ?? "Base style" },
              { key: "quantity_ordered", title: "Qty", render: (row) => row.quantity_ordered },
              { key: "unit_cost", title: "Unit Cost", render: (row) => formatCurrency(row.unit_cost) },
            ]}
            rows={poLineItems}
          />
        </div>
      </div>

      <div className="panel section-stack">
        <div className="panel-header"><h3>Inventory Events</h3></div>
        <DataTable
          emptyMessage="No inventory events for this SKU yet."
          columns={[
            { key: "event_type", title: "Event", render: (row) => row.event_type },
            { key: "quantity_change", title: "Units", render: (row) => row.quantity_change },
            { key: "event_date", title: "Date", render: (row) => formatDate(row.event_date) },
            { key: "notes", title: "Notes", render: (row) => row.notes ?? "N/A" },
          ]}
          rows={events}
        />
      </div>
    </div>
  );
}
