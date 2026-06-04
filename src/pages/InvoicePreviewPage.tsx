import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { InvoiceDocumentView } from "@/components/PurchaseOrderDocumentView";
import { useAsyncData } from "@/hooks/useAsyncData";
import { invoiceService } from "@/services/invoiceService";
import { buildInvoiceDocumentHtml } from "@/utils/purchaseOrderDocument";
import { previewPurchaseOrderDocument, printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";

export function InvoicePreviewPage() {
  const params = useParams();
  const invoiceId = params.id ?? "";
  const { data, loading, error } = useAsyncData(
    () => invoiceService.getById(invoiceId),
    [invoiceId],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load invoice preview"} />;

  const { invoice, lineItems } = data;
  const documentTitle = `Invoice ${invoice.invoice_number}`;
  const currentDocumentHtml = buildInvoiceDocumentHtml(
    invoice,
    lineItems,
    invoice.buyers ?? null,
    invoice.retailers ?? null,
  );

  return (
    <div className="section-stack">
      <PageHeader
        title={`Preview ${invoice.invoice_number}`}
        description="Use this dedicated document screen for review, browser print, and save-to-PDF."
        actions={(
          <div className="btn-row">
            <Link className="btn btn-ghost" to={`/invoices/${invoiceId}`}>Back</Link>
            <button
              className="btn btn-secondary"
              onClick={() => previewPurchaseOrderDocument(documentTitle, currentDocumentHtml)}
            >
              Open Clean Preview
            </button>
            <button
              className="btn btn-primary"
              onClick={() => printPurchaseOrderDocument(documentTitle, currentDocumentHtml)}
            >
              Print / Save PDF
            </button>
          </div>
        )}
      />
      <div className="panel">
        <InvoiceDocumentView invoice={invoice} lineItems={lineItems} />
      </div>
    </div>
  );
}
