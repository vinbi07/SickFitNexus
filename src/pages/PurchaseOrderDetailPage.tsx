import { useParams } from "react-router-dom";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { formatCurrency, formatDate } from "@/utils/format";

export function PurchaseOrderDetailPage() {
  const params = useParams();
  const poId = params.id ?? "";
  const { data, loading, error, reload } = useAsyncData(() => purchaseOrderService.getById(poId), [poId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load purchase order detail"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title={`PO ${data.purchaseOrder.po_number}`}
        description={`${data.purchaseOrder.vendors?.name ?? "Unassigned vendor"} • ${data.purchaseOrder.locations?.name ?? "No location assigned"}`}
        actions={<StatusBadge label={data.purchaseOrder.status} />}
      />
      <div className="card-grid">
        <div className="card metric-card">
          <span className="metric-label">Total Cost</span>
          <strong className="metric-value">{formatCurrency(data.purchaseOrder.total_cost)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Order Date</span>
          <strong className="metric-value">{formatDate(data.purchaseOrder.order_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Expected Delivery</span>
          <strong className="metric-value">{formatDate(data.purchaseOrder.expected_delivery_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Actual Delivery</span>
          <strong className="metric-value">{formatDate(data.purchaseOrder.actual_delivery_date)}</strong>
        </div>
      </div>
      <div className="panel section-stack">
        <div className="panel-header"><h3>PO Line Items</h3></div>
        <DataTable
          columns={[
            { key: "sku", title: "SKU", render: (row) => row.sku },
            { key: "product_name", title: "Product", render: (row) => row.product_name },
            { key: "quantity_ordered", title: "Ordered", render: (row) => row.quantity_ordered },
            { key: "quantity_received", title: "Received", render: (row) => row.quantity_received },
            { key: "unit_cost", title: "Unit Cost", render: (row) => formatCurrency(row.unit_cost) },
            { key: "line_total", title: "Line Total", render: (row) => formatCurrency(row.line_total) },
          ]}
          rows={data.lineItems}
        />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Activity Timeline</h3></div>
          <div className="timeline">
            {data.activity.map((event) => (
              <div key={event.id} className="timeline-item">
                <strong>{event.title}</strong>
                <p>{event.description}</p>
                <span className="muted">{formatDate(event.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
        <CommentsPanel
          entityType="purchase_order"
          entityId={poId}
          comments={data.comments}
          onSaved={reload}
        />
      </div>
    </div>
  );
}
