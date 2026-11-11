import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { InvoiceDocumentView } from "@/components/PurchaseOrderDocumentView";
import { StatusBadge } from "@/components/StatusBadge";
import { useAsyncData } from "@/hooks/useAsyncData";
import { invoiceService } from "@/services/invoiceService";
import type { InvoiceStatus } from "@/types/domain";
import { formatCurrency, formatDate } from "@/utils/format";
import { buildInvoiceDocumentHtml } from "@/utils/purchaseOrderDocument";
import { printPurchaseOrderDocument, previewPurchaseOrderDocument } from "@/utils/purchaseOrderActions";

const INVOICE_STATUSES: InvoiceStatus[] = ["Draft", "Sent", "Paid", "Void"];

export function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id ?? "";
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    () => invoiceService.getById(invoiceId),
    [invoiceId],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load invoice"} />;

  const { invoice, lineItems } = data;
  const currentDocumentHtml = buildInvoiceDocumentHtml(
    invoice,
    lineItems,
    invoice.buyers ?? null,
    invoice.retailers ?? null,
  );
  const documentTitle = `Invoice ${invoice.invoice_number}`;

  return (
    <div className="section-stack">
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <PageHeader
        title={documentTitle}
        description={`${invoice.retailers?.name ?? invoice.vendors?.name ?? "Unassigned"} | ${invoice.buyers?.buyer_name ?? invoice.buyer_name_snapshot ?? "No buyer linked"}`}
        actions={(
          <div className="btn-row">
            <StatusBadge label={invoice.status} />
            <Link className="btn btn-ghost btn-small" to="/invoices">Back to Invoices</Link>
            {invoice.source_po_id ? (
              <Link className="btn btn-ghost btn-small" to={`/purchase-orders/${invoice.source_po_id}`}>
                View Source PO
              </Link>
            ) : null}
            <Link className="btn btn-secondary btn-small" to={`/invoices/${invoiceId}/preview`}>
              Preview
            </Link>
            <button
              className="btn btn-secondary btn-small"
              onClick={() => previewPurchaseOrderDocument(documentTitle, currentDocumentHtml)}
            >
              Open Clean Preview
            </button>
            <button
              className="btn btn-primary btn-small"
              onClick={() => printPurchaseOrderDocument(documentTitle, currentDocumentHtml)}
            >
              Print / Save PDF
            </button>
          </div>
        )}
      />
      <div className="card-grid">
        <div className="card metric-card">
          <span className="metric-label">Total Cost</span>
          <strong className="metric-value">{formatCurrency(invoice.total_cost)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Total Units</span>
          <strong className="metric-value">{invoice.total_units}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Invoice Date</span>
          <strong className="metric-value">{formatDate(invoice.invoice_date ?? invoice.order_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Due Date</span>
          <strong className="metric-value">{formatDate(invoice.due_date)}</strong>
        </div>
        <div className="card metric-card">
          <span className="metric-label">Currency</span>
          <strong className="metric-value">{invoice.currency_code ?? "USD"}</strong>
        </div>
        {invoice.source_po_id ? (
          <div className="card metric-card">
            <span className="metric-label">Source</span>
            <strong className="metric-value">Converted PO</strong>
          </div>
        ) : null}
      </div>
      {invoice.stock_warnings?.length ? (
        <div className="panel">
          <div className="panel-header">
            <h3>Review before sending</h3>
          </div>
          <p className="helper-text">Found when this invoice was generated. They are not printed on the invoice.</p>
          <ul className="po-import-warnings">
            {invoice.stock_warnings.map((warning, index) => (
              <li key={index} className={`po-import-warning-${warning.kind}`}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-header">
          <h3>Status</h3>
        </div>
        <div className="btn-row">
          {INVOICE_STATUSES.map((s) => (
            <button
              key={s}
              disabled={updatingStatus || invoice.status === s}
              className={`btn btn-small ${invoice.status === s ? "btn-primary" : "btn-secondary"}`}
              onClick={async () => {
                try {
                  setUpdatingStatus(true);
                  await invoiceService.updateStatus(invoiceId, s);
                  await reload();
                  setNotice({ tone: "success", message: `Invoice status updated to ${s}.` });
                } catch (err) {
                  setNotice({ tone: "error", message: err instanceof Error ? err.message : "Failed to update status." });
                } finally {
                  setUpdatingStatus(false);
                }
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <InvoiceDocumentView invoice={invoice} lineItems={lineItems} />
      </div>
    </div>
  );
}
