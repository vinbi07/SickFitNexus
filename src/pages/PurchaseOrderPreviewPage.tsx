import { Link, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { PurchaseOrderDocumentView } from "@/components/PurchaseOrderDocumentView";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { buildPurchaseOrderDocumentHtml } from "@/utils/purchaseOrderDocument";
import { previewPurchaseOrderDocument, printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";

export function PurchaseOrderPreviewPage() {
  const params = useParams();
  const poId = params.id ?? "";
  const { data, loading, error } = useAsyncData(() => purchaseOrderService.getById(poId), [poId]);

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load PO preview"} />;

  const currentDocumentHtml = buildPurchaseOrderDocumentHtml(
    data.purchaseOrder,
    data.lineItems,
    data.purchaseOrder.buyers ?? null,
    data.purchaseOrder.retailers ?? null,
  );

  return (
    <div className="section-stack">
      <PageHeader
        title={`Preview ${data.purchaseOrder.po_number}`}
        description="Use this dedicated document screen for review, browser print, and save-to-PDF."
        actions={(
          <div className="btn-row">
            <Link className="btn btn-ghost" to={`/purchase-orders/${poId}`}>Back</Link>
            <Link className="btn btn-secondary" to={`/purchase-orders/${poId}/edit`}>Edit PO</Link>
            <button
              className="btn btn-secondary"
              onClick={() => {
                previewPurchaseOrderDocument(`PO ${data.purchaseOrder.po_number}`, currentDocumentHtml);
              }}
            >
              Open Clean Preview
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                printPurchaseOrderDocument(`PO ${data.purchaseOrder.po_number}`, currentDocumentHtml);
              }}
            >
              Print / Save PDF
            </button>
          </div>
        )}
      />
      <div className="panel">
        <PurchaseOrderDocumentView purchaseOrder={data.purchaseOrder} lineItems={data.lineItems} />
      </div>
    </div>
  );
}
