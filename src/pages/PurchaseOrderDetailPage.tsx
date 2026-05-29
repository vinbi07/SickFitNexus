import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CommentsPanel } from "@/features/comments/CommentsPanel";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderDocumentView } from "@/components/PurchaseOrderDocumentView";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type { PurchaseOrderCounterEvent } from "@/types/domain";
import { daysBetween } from "@/utils/date";
import { formatCurrency, formatDate } from "@/utils/format";
import { printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";
import { buildPurchaseOrderDocumentHtml } from "@/utils/purchaseOrderDocument";

function formatCounterEventTitle(event: PurchaseOrderCounterEvent) {
  switch (event.event_type) {
    case "countered":
      return "SickFit countered the order";
    case "buyer_revised":
      return "Buyer revised the live link order";
    case "accepted":
      return "Counter accepted";
    case "declined":
      return "Counter declined";
    default:
      return String(event.event_type).replaceAll("_", " ");
  }
}

function formatCounterEventMeta(event: PurchaseOrderCounterEvent) {
  const payload = event.payload as { skuCount?: number; totalUnits?: number; subtotal?: number; priorStatus?: string } | null;
  const parts = [
    payload?.skuCount ? `${payload.skuCount} SKU${payload.skuCount === 1 ? "" : "s"}` : null,
    payload?.totalUnits ? `${payload.totalUnits} units` : null,
    payload?.subtotal ? formatCurrency(payload.subtotal) : null,
    payload?.priorStatus ? `From ${payload.priorStatus}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function PurchaseOrderDetailPage() {
  const params = useParams();
  const navigate = useNavigate();
  const poId = params.id ?? "";
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
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
  const generated = data.generatedDocuments[0];
  const currentDocumentHtml = buildPurchaseOrderDocumentHtml(
    data.purchaseOrder,
    data.lineItems,
    data.purchaseOrder.buyers ?? null,
    data.purchaseOrder.retailers ?? null,
  );

  return (
    <div className="section-stack">
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <PageHeader
        title={`PO ${data.purchaseOrder.po_number}`}
        description={`${data.purchaseOrder.po_type} | ${data.purchaseOrder.retailers?.name ?? data.purchaseOrder.vendors?.name ?? "Unassigned"} | ${data.purchaseOrder.buyers?.buyer_name ?? "No buyer linked"}`}
        actions={(
          <div className="btn-row">
            <StatusBadge label={data.purchaseOrder.status} />
            <Link className="btn btn-secondary btn-small" to={`/purchase-orders/${poId}/edit`}>Edit PO</Link>
            <button className="btn btn-secondary btn-small" onClick={() => navigate(`/purchase-orders/new?copyFrom=${poId}`)}>Duplicate PO</button>
            <button
              className="btn btn-ghost btn-small"
              onClick={() => {
                const recipients = [data.purchaseOrder.bill_to_email, data.purchaseOrder.retailers?.primary_contact_email]
                  .filter(Boolean)
                  .join(",");
                window.location.href = `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(`Purchase Order ${data.purchaseOrder.po_number}`)}&body=${encodeURIComponent(`Please review Purchase Order ${data.purchaseOrder.po_number}.\n\nPreview link: ${window.location.origin}/purchase-orders/${poId}/preview`)}`;
              }}
            >
              Email PO
            </button>
            <button className="btn btn-primary btn-small" onClick={async () => {
              try {
                await purchaseOrderService.approve(poId);
                await reload();
                setNotice({ tone: "success", message: "PO approved successfully." });
              } catch (err) {
                setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to approve PO." });
              }
            }}>Approve</button>
            <button className="btn btn-secondary btn-small" onClick={async () => {
              const response = window.prompt("Add counter note for the buyer", data.purchaseOrder.internal_notes ?? "");
              if (response === null) return;
              try {
                await purchaseOrderService.counter(poId, response);
                await reload();
                setNotice({ tone: "success", message: "PO moved to countered status." });
              } catch (err) {
                setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to counter this PO." });
              }
            }}>Counter</button>
            <button className="btn btn-ghost btn-small" onClick={async () => {
              try {
                await purchaseOrderService.queueForFulfillment(poId);
                await reload();
                setNotice({ tone: "success", message: "PO queued for fulfillment." });
              } catch (err) {
                setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to queue PO." });
              }
            }}>Queue for Fulfillment</button>
            <button className="btn btn-secondary btn-small" onClick={async () => {
              try {
                await purchaseOrderService.fulfill(poId);
                await reload();
                setNotice({ tone: "success", message: "PO fulfilled and inventory committed." });
              } catch (err) {
                setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to fulfill PO." });
              }
            }}>Fulfill</button>
            <button className="btn btn-danger btn-small" onClick={async () => {
              try {
                await purchaseOrderService.reject(poId, "Cancelled from approval workspace.");
                await reload();
                setNotice({ tone: "success", message: "PO rejected and allocation released." });
              } catch (err) {
                setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to reject PO." });
              }
            }}>Reject / Cancel</button>
          </div>
        )}
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
          <span className="metric-label">Invoice Status</span>
          <strong className="metric-value">{data.purchaseOrder.invoice_status ?? "Open"}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Allocation</span>
          <strong className="metric-value">{data.purchaseOrder.allocation_status}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Compliance</span>
          <strong className="metric-value">{String((data.purchaseOrder.compliance_snapshot as { summary?: string } | null)?.summary ?? "N/A")}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Paid to Delivered</span>
          <strong className="metric-value">{paidToDeliveredDays !== null ? `${paidToDeliveredDays}d` : "Open"}</strong>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h3>PO Preview</h3>
          <div className="btn-row">
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                printPurchaseOrderDocument(`PO ${data.purchaseOrder.po_number}`, currentDocumentHtml);
              }}
            >
              Print / Save PDF
            </button>
          </div>
        </div>
        <PurchaseOrderDocumentView purchaseOrder={data.purchaseOrder} lineItems={data.lineItems} />
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Lifecycle</h3></div>
          <div className="detail-grid">
            <div className="detail-card"><span>Retailer</span><strong>{data.purchaseOrder.retailers?.name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Buyer</span><strong>{data.purchaseOrder.buyers?.buyer_name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Vendor</span><strong>{data.purchaseOrder.vendors?.name ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Ship Date</span><strong>{formatDate(data.purchaseOrder.ship_date)}</strong></div>
            <div className="detail-card"><span>ETA</span><strong>{formatDate(data.purchaseOrder.eta_date ?? data.purchaseOrder.expected_delivery_date)}</strong></div>
            <div className="detail-card"><span>Approval</span><strong>{data.purchaseOrder.approval_status}</strong></div>
            <div className="detail-card"><span>Allocation</span><strong>{data.purchaseOrder.allocation_status}</strong></div>
            <div className="detail-card"><span>Invoice Status</span><strong>{data.purchaseOrder.invoice_status ?? "Open"}</strong></div>
            <div className="detail-card"><span>Invoice Paid</span><strong>{formatDate(data.purchaseOrder.invoice_paid_at)}</strong></div>
            <div className="detail-card"><span>Shipment Status</span><strong>{data.purchaseOrder.shipment_status ?? data.purchaseOrder.tracking_status ?? "None"}</strong></div>
            <div className="detail-card"><span>Tracking</span><strong>{data.purchaseOrder.tracking_number ?? "None"}</strong></div>
            <div className="detail-card"><span>Source Channel</span><strong>{data.purchaseOrder.source_channel ?? "N/A"}</strong></div>
            <div className="detail-card"><span>Generated Form</span><strong>{data.purchaseOrder.generated_form_url ? <a href={data.purchaseOrder.generated_form_url} target="_blank" rel="noreferrer">Open</a> : "Not generated"}</strong></div>
            <div className="detail-card"><span>Counter Status</span><strong>{data.purchaseOrder.counter_status}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Compliance Snapshot</span><strong>{String((data.purchaseOrder.compliance_snapshot as { summary?: string } | null)?.summary ?? "No compliance snapshot recorded.")}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Hold Reason</span><strong>{data.purchaseOrder.hold_reason ?? "No hold reason."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Buyer Notes</span><strong>{data.purchaseOrder.buyer_notes ?? "No buyer notes added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Internal Notes</span><strong>{data.purchaseOrder.internal_notes ?? "No internal notes added."}</strong></div>
            <div className="detail-card" style={{ gridColumn: "1 / -1" }}><span>Notes</span><strong>{data.purchaseOrder.notes ?? "No notes added."}</strong></div>
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>PO Line Items</h3></div>
          <DataTable
            columns={[
              { key: "sku", title: "SKU", render: (row) => row.sku },
              { key: "product_name", title: "Product", render: (row) => row.product_name },
              { key: "case_quantity", title: "Cases", render: (row) => row.case_quantity },
              { key: "quantity_ordered", title: "Ordered", render: (row) => row.quantity_ordered },
              { key: "unit_quantity", title: "Units", render: (row) => row.unit_quantity },
              { key: "quantity_received", title: "Received", render: (row) => row.quantity_received },
              { key: "unit_cost", title: "Unit Cost", render: (row) => formatCurrency(row.unit_cost) },
              { key: "line_total", title: "Extended Cost", render: (row) => formatCurrency(row.extended_cost || row.line_total) },
            ]}
            rows={data.lineItems}
          />
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Reservation Ledger</h3></div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                { key: "product_id", title: "Product", render: (row) => row.product_id },
                { key: "reserved_units", title: "Units", render: (row) => row.reserved_units },
                { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
                { key: "actor_label", title: "Actor", render: (row) => row.actor_label ?? "Buyer flow" },
                { key: "updated_at", title: "Updated", render: (row) => formatDate(row.updated_at) },
              ]}
              rows={data.reservations}
              emptyMessage="No reservation records yet."
            />
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Status History</h3></div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                { key: "from_status", title: "From", render: (row) => row.from_status ?? "N/A" },
                { key: "to_status", title: "To", render: (row) => row.to_status },
                { key: "actor_label", title: "Actor", render: (row) => row.actor_label ?? "System" },
                { key: "notes", title: "Notes", render: (row) => row.notes ?? "N/A" },
                { key: "created_at", title: "When", render: (row) => formatDate(row.created_at) },
              ]}
              rows={data.statusHistory}
              emptyMessage="No status history yet."
            />
          </div>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Counter Workflow</h3></div>
          <div className="timeline scroll-panel">
            {data.counterEvents.length ? data.counterEvents.map((event) => (
              <div key={event.id} className={`timeline-item ${event.event_type === "countered" ? "timeline-item-danger" : ""}`}>
                <strong>{formatCounterEventTitle(event)}</strong>
                <p>{event.actor_label ?? "Buyer"}</p>
                {formatCounterEventMeta(event) ? <p>{formatCounterEventMeta(event)}</p> : null}
                <p>{event.notes ?? "No note provided."}</p>
                <span className="muted">{formatDate(event.created_at)}</span>
              </div>
            )) : <div className="empty-state">No counter activity yet.</div>}
          </div>
        </div>
        <div className="panel section-stack">
          <div className="panel-header"><h3>Compliance Holds</h3></div>
          <div className="scroll-panel">
            <DataTable
              columns={[
                { key: "summary", title: "Summary", render: (row) => row.summary },
                { key: "missing_docs", title: "Missing Docs", render: (row) => row.missing_docs.join(", ") || "None" },
                { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
                { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
              ]}
              rows={data.complianceHolds}
              emptyMessage="No compliance holds on this order."
            />
          </div>
        </div>
      </div>
      <div className="split-grid">
        <div className="panel section-stack">
          <div className="panel-header"><h3>Generated PO Documents</h3></div>
          <DataTable
            columns={[
              { key: "title", title: "Title", render: (row) => row.title },
              { key: "created_by_label", title: "Created By", render: (row) => row.created_by_label ?? "System" },
              { key: "created_at", title: "Created", render: (row) => formatDate(row.created_at) },
            ]}
            rows={data.generatedDocuments}
            emptyMessage="No generated PO documents yet."
          />
        </div>
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
          <div className="panel-header"><h3>Queued Notifications</h3></div>
          <div className="timeline">
            {data.notifications.length ? data.notifications.map((notification) => (
              <div key={notification.id} className="timeline-item">
                <strong>{notification.subject}</strong>
                <p>{notification.recipient_type} · {notification.status}</p>
                <span className="muted">{notification.recipient_email ?? notification.recipient_name ?? "Internal queue"}</span>
              </div>
            )) : <div className="empty-state">No queued notifications yet.</div>}
          </div>
        </div>
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
