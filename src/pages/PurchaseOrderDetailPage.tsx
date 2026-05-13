import { useState } from "react";
import { useParams } from "react-router-dom";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { daysBetween } from "@/utils/date";
import { formatCurrency, formatDate } from "@/utils/format";

export function PurchaseOrderDetailPage() {
  const params = useParams();
  const poId = params.id ?? "";
  const [newMessage, setNewMessage] = useState({
    sender_name: "",
    sender_role: "",
    channel: "Internal Note",
    body: "",
  });
  const [newDocument, setNewDocument] = useState({
    document_type: "Other",
    title: "",
    file_url: "",
  });
  const { data, loading, error, reload } = useAsyncData(() => purchaseOrderService.getById(poId), [poId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load purchase order detail"} />;

  const paidToDeliveredDays =
    data.purchaseOrder.invoice_paid_at && data.purchaseOrder.actual_delivery_date
      ? daysBetween(data.purchaseOrder.invoice_paid_at, data.purchaseOrder.actual_delivery_date)
      : null;

  return (
    <div className="section-stack">
      <PageHeader
        title={`PO ${data.purchaseOrder.po_number}`}
        description={`${data.purchaseOrder.po_type} | ${data.purchaseOrder.retailers?.name ?? data.purchaseOrder.vendors?.name ?? "Unassigned"} | ${data.purchaseOrder.locations?.name ?? "No location assigned"}`}
        actions={<StatusBadge label={data.purchaseOrder.status} />}
      />
      <div className="card-grid">
        <div className="card metric-card">
          <span className="metric-label">Total Cost</span>
          <strong className="metric-value">{formatCurrency(data.purchaseOrder.total_cost)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Submitted</span>
          <strong className="metric-value">{formatDate(data.purchaseOrder.submitted_at ?? data.purchaseOrder.order_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Expected Delivery</span>
          <strong className="metric-value">{formatDate(data.purchaseOrder.expected_delivery_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Paid to Delivered</span>
          <strong className="metric-value">{paidToDeliveredDays !== null ? `${paidToDeliveredDays}d` : "Open"}</strong>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Lifecycle</h3></div>
          <div className="detail-grid">
            <div className="detail-card"><span>Retailer</span><strong>{data.purchaseOrder.retailers?.name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Vendor</span><strong>{data.purchaseOrder.vendors?.name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Invoice Paid</span><strong>{formatDate(data.purchaseOrder.invoice_paid_at)}</strong></div>
            <div className="detail-card"><span>Tracking</span><strong>{data.purchaseOrder.tracking_number ?? data.purchaseOrder.tracking_status ?? "None"}</strong></div>
            <div className="detail-card"><span>Source Channel</span><strong>{data.purchaseOrder.source_channel ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Generated Form</span><strong>{data.purchaseOrder.generated_form_url ? <a href={data.purchaseOrder.generated_form_url} target="_blank" rel="noreferrer">Open</a> : "Not generated"}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{data.purchaseOrder.notes ?? "No notes added."}</strong></div>
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
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Manufacturer / Retailer Comms</h3></div>
          <div className="timeline">
            {data.messages.map((message) => (
              <div key={message.id} className="timeline-item">
                <strong>{message.sender_name} | {message.channel}</strong>
                <p>{message.body}</p>
                <span className="muted">{formatDate(message.created_at)}</span>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div className="field field-half">
              <label>Sender</label>
              <input value={newMessage.sender_name} onChange={(event) => setNewMessage((current) => ({ ...current, sender_name: event.target.value }))} />
            </div>
            <div className="field field-half">
              <label>Role</label>
              <input value={newMessage.sender_role} onChange={(event) => setNewMessage((current) => ({ ...current, sender_role: event.target.value }))} />
            </div>
            <div className="field field-half">
              <label>Channel</label>
              <select value={newMessage.channel} onChange={(event) => setNewMessage((current) => ({ ...current, channel: event.target.value }))}>
                <option>Email</option>
                <option>Text</option>
                <option>Call</option>
                <option>Internal Note</option>
              </select>
            </div>
            <div className="field field-wide">
              <label>Message</label>
              <textarea rows={3} value={newMessage.body} onChange={(event) => setNewMessage((current) => ({ ...current, body: event.target.value }))} />
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await purchaseOrderService.saveMessage({
                  purchase_order_id: poId,
                  sender_name: newMessage.sender_name,
                  sender_role: newMessage.sender_role || null,
                  channel: newMessage.channel as "Email" | "Text" | "Call" | "Internal Note",
                  body: newMessage.body,
                });
                setNewMessage({ sender_name: "", sender_role: "", channel: "Internal Note", body: "" });
                await reload();
              }}
            >
              Add Communication
            </button>
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Documents</h3></div>
          <div className="timeline">
            {data.documents.map((document) => (
              <div key={document.id} className="timeline-item">
                <strong>{document.title}</strong>
                <p>{document.document_type}</p>
                <span className="muted">{formatDate(document.created_at)}</span>
                {document.file_url ? <a href={document.file_url} target="_blank" rel="noreferrer">Open file</a> : null}
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div className="field field-half">
              <label>Document Type</label>
              <select value={newDocument.document_type} onChange={(event) => setNewDocument((current) => ({ ...current, document_type: event.target.value }))}>
                <option>Retailer Intake</option>
                <option>Generated Form</option>
                <option>Invoice</option>
                <option>Tracking</option>
                <option>Other</option>
              </select>
            </div>
            <div className="field field-half">
              <label>Title</label>
              <input value={newDocument.title} onChange={(event) => setNewDocument((current) => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="field field-wide">
              <label>File URL</label>
              <input value={newDocument.file_url} onChange={(event) => setNewDocument((current) => ({ ...current, file_url: event.target.value }))} />
            </div>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={async () => {
                await purchaseOrderService.saveDocument({
                  purchase_order_id: poId,
                  document_type: newDocument.document_type as "Retailer Intake" | "Generated Form" | "Invoice" | "Tracking" | "Other",
                  title: newDocument.title,
                  file_url: newDocument.file_url || null,
                });
                setNewDocument({ document_type: "Other", title: "", file_url: "" });
                await reload();
              }}
            >
              Attach Document
            </button>
          </div>
        </div>
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
        <CommentsPanel entityType="purchase_order" entityId={poId} comments={data.comments} onSaved={reload} />
      </div>
    </div>
  );
}
