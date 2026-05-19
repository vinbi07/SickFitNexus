import { useState } from "react";
import { useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { EntityFormModal } from "@/components/EntityFormModal";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buyerService } from "@/services/buyerService";
import { retailerService } from "@/services/retailerService";
import type { Buyer } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";

export function RetailerDetailPage() {
  const params = useParams();
  const retailerId = params.id ?? "";
  const [editingBuyer, setEditingBuyer] = useState<Partial<Buyer> | null>(null);
  const [deletingBuyer, setDeletingBuyer] = useState<Buyer | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => retailerService.getProfile(retailerId), [retailerId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load retailer profile"} />;

  return (
    <div className="section-stack">
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
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
          <div className="panel-header">
            <h3>Buyer Access</h3>
            <button className="btn btn-primary btn-small" onClick={() => setEditingBuyer({ retailer_id: data.retailer.id, company_name: data.retailer.name, order_mode_enabled: true })}>Add Buyer</button>
          </div>
          <DataTable
            emptyMessage="No buyers configured for this account yet."
            columns={[
              { key: "buyer_name", title: "Buyer", render: (row) => row.buyer_name },
              { key: "buyer_email", title: "Email", render: (row) => row.buyer_email },
              { key: "payment_terms", title: "Terms", render: (row) => row.payment_terms ?? "N/A" },
              { key: "template", title: "Lookbook", render: (row) => row.lookbook_templates?.name ?? "All wholesale products" },
              { key: "order_mode_enabled", title: "Order Mode", render: (row) => <StatusBadge label={row.order_mode_enabled ? "Enabled" : "Disabled"} /> },
              { key: "access", title: "Magic Link", render: (row) => <span className="helper-text">/lookbook/{row.access_token}</span> },
              {
                key: "actions",
                title: "Actions",
                render: (row) => (
                  <div className="btn-row">
                    <button className="btn btn-secondary btn-small" onClick={() => setEditingBuyer(row)}>Edit</button>
                    <button className="btn btn-ghost btn-small" onClick={async () => {
                      await navigator.clipboard.writeText(`${window.location.origin}/lookbook/${row.access_token}`);
                      setNotice({ tone: "success", message: "Magic link copied to clipboard." });
                    }}>Copy Link</button>
                    <button className="btn btn-danger btn-small" onClick={() => setDeletingBuyer(row)}>Delete</button>
                  </div>
                ),
              },
            ]}
            rows={data.buyers}
          />
        </div>
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
      {editingBuyer ? (
        <EntityFormModal<Partial<Buyer>>
          title={editingBuyer.id ? "Edit Buyer" : "Add Buyer"}
          saveLabel={editingBuyer.id ? "Save Buyer" : "Create Buyer"}
          initialValues={{
            company_name: editingBuyer.company_name ?? data.retailer.name,
            buyer_name: editingBuyer.buyer_name ?? "",
            buyer_email: editingBuyer.buyer_email ?? "",
            phone: editingBuyer.phone ?? "",
            billing_address: editingBuyer.billing_address ?? "",
            shipping_address: editingBuyer.shipping_address ?? "",
            payment_terms: editingBuyer.payment_terms ?? "",
            compliance_requirements: editingBuyer.compliance_requirements ?? "",
            assigned_sales_rep: editingBuyer.assigned_sales_rep ?? "",
            lookbook_template_id: editingBuyer.lookbook_template_id ?? "",
            order_mode_enabled: editingBuyer.order_mode_enabled ?? true,
            token_expires_at: editingBuyer.token_expires_at ?? "",
          }}
          fields={[
            { key: "company_name", label: "Company Name" },
            { key: "buyer_name", label: "Buyer Name", required: true },
            { key: "buyer_email", label: "Buyer Email", required: true },
            { key: "phone", label: "Phone" },
            { key: "payment_terms", label: "Payment Terms" },
            { key: "assigned_sales_rep", label: "Assigned Sales Rep" },
            { key: "lookbook_template_id", label: "Lookbook Template", type: "select", options: data.lookbookTemplates.map((template) => ({ label: template.name, value: template.id })) },
            { key: "billing_address", label: "Billing Address", type: "textarea" },
            { key: "shipping_address", label: "Shipping Address", type: "textarea" },
            { key: "compliance_requirements", label: "Compliance Requirements", type: "textarea" },
            { key: "token_expires_at", label: "Token Expires", type: "date" },
            { key: "order_mode_enabled", label: "Order Mode Enabled", type: "checkbox" },
          ]}
          onSave={async (values) => {
            await buyerService.upsert({
              ...editingBuyer,
              ...values,
              retailer_id: data.retailer.id,
            });
            await reload();
            setNotice({ tone: "success", message: editingBuyer.id ? "Buyer updated successfully." : "Buyer created successfully." });
          }}
          onClose={() => setEditingBuyer(null)}
        />
      ) : null}
      {deletingBuyer ? (
        <ConfirmDialog
          title="Delete buyer?"
          message={`Remove ${deletingBuyer.buyer_name} and revoke the magic link?`}
          busy={false}
          onClose={() => setDeletingBuyer(null)}
          onConfirm={async () => {
            await buyerService.remove(deletingBuyer.id);
            setDeletingBuyer(null);
            await reload();
            setNotice({ tone: "success", message: "Buyer deleted successfully." });
          }}
        />
      ) : null}
    </div>
  );
}
