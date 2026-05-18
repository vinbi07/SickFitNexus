import { useParams } from "react-router-dom";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { retailerService } from "@/services/retailerService";
import { formatCurrency, formatDate } from "@/utils/format";

export function RetailerDetailPage() {
  const params = useParams();
  const retailerId = params.id ?? "";
  const { data, loading, error } = useAsyncData(() => retailerService.getProfile(retailerId), [retailerId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load retailer profile"} />;

  return (
    <div className="section-stack">
      <PageHeader
        title={data.retailer.name}
        description={`${data.retailer.account_number ?? "No account number"} | ${data.retailer.retailer_group ?? "Standalone account"}${data.parentRetailer ? ` | Parent: ${data.parentRetailer.name}` : ""}`}
        actions={<StatusBadge label={data.retailer.status} />}
      />
      <div className="card-grid">
        <div className="card metric-card">
          <span className="metric-label">Open Invoices</span>
          <strong className="metric-value">{data.openInvoices.length}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Shipped Invoices</span>
          <strong className="metric-value">{data.shippedInvoices.length}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">In Route</span>
          <strong className="metric-value">{data.inRouteInvoices.length}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Recent POs</span>
          <strong className="metric-value">{data.recentPos.length}</strong>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Account Operations</h3></div>
          <div className="detail-grid">
            <div className="detail-card"><span>Primary Contact</span><strong>{data.retailer.primary_contact_name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Email</span><strong>{data.retailer.primary_contact_email ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Phone</span><strong>{data.retailer.primary_contact_phone ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Next Reorder Window</span><strong>{data.retailer.next_reorder_start ? `${formatDate(data.retailer.next_reorder_start)} - ${formatDate(data.retailer.next_reorder_end)}` : "Not set"}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Additional Contacts</span><strong>{data.retailer.secondary_contacts ?? "No extra contacts added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>SOPs</span><strong>{data.retailer.sop_notes ?? "No SOP notes added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Shipping Requirements</span><strong>{data.retailer.shipping_requirements ?? "No shipping requirements added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{data.retailer.notes ?? "No notes added."}</strong></div>
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Location Coverage</h3></div>
          <div className="timeline">
            {data.locations.length ? data.locations.map((location) => (
              <div key={location.id} className="timeline-item">
                <strong>{location.name}</strong>
                <p>{location.address ?? "No address on file"}</p>
              </div>
            )) : <div className="empty-state">No locations linked yet.</div>}
          </div>
          {data.childRetailers.length ? (
            <>
              <div className="panel-header"><h3>Child Accounts</h3></div>
              <div className="timeline">
                {data.childRetailers.map((retailer) => (
                  <div key={retailer.id} className="timeline-item">
                    <strong>{retailer.name}</strong>
                    <p>{retailer.account_number ?? retailer.retailer_group ?? "No account metadata yet"}</p>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Top SKUs</h3></div>
          <DataTable
            emptyMessage="No SKU history for this retailer yet."
            columns={[
              { key: "sku", title: "SKU", render: (row) => row.sku },
              { key: "name", title: "Product", render: (row) => row.name },
              { key: "units", title: "Units", render: (row) => row.units },
              { key: "revenue", title: "Revenue", render: (row) => formatCurrency(row.revenue) },
            ]}
            rows={data.topSkus}
          />
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Recent POs</h3></div>
          <DataTable
            emptyMessage="No recent purchase orders for this retailer yet."
            columns={[
              { key: "po_number", title: "PO", render: (row) => row.po_number },
              { key: "order_date", title: "Order Date", render: (row) => formatDate(row.order_date) },
              { key: "ship_date", title: "Ship Date", render: (row) => formatDate(row.ship_date) },
              { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
              { key: "invoice_status", title: "Invoice Status", render: (row) => <StatusBadge label={row.invoice_status ?? "Open"} /> },
              { key: "total_cost", title: "Total", render: (row) => formatCurrency(row.total_cost) },
            ]}
            rows={data.recentPos}
          />
        </div>
      </div>
    </div>
  );
}
