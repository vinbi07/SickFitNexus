import { useRef } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { PurchaseOrder } from "@/types/domain";

export function PurchaseOrderDrawerHeader({
  purchaseOrder,
  titleId,
  onClose,
  onOpenFullPage,
  onDuplicate,
  onPrint,
  onConvertToInvoice,
  onDelete,
  busy,
}: {
  purchaseOrder: PurchaseOrder;
  titleId: string;
  onClose: () => void;
  onOpenFullPage: () => void;
  onDuplicate: () => void;
  onPrint?: () => void;
  onConvertToInvoice: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const vendorOrManufacturerName =
    purchaseOrder.retailers?.name ??
    purchaseOrder.vendors?.name ??
    purchaseOrder.bill_to_company_name ??
    "Unassigned";

  function runAndClose(action: () => void) {
    if (detailsRef.current) detailsRef.current.open = false;
    action();
  }

  return (
    <div className="po-drawer-header">
      <div className="po-drawer-header-title">
        <span className="po-drawer-eyebrow">Purchase Order</span>
        <h3 id={titleId}>{purchaseOrder.po_number}</h3>
        <div className="po-drawer-header-meta">
          <StatusBadge label={purchaseOrder.status} />
          <span>{vendorOrManufacturerName}</span>
        </div>
      </div>
      <div className="po-drawer-header-actions">
        <details className="actions-dropdown" ref={detailsRef}>
          <summary className="btn btn-ghost btn-small">More</summary>
          <div className="actions-dropdown-menu">
            <button type="button" onClick={() => runAndClose(onOpenFullPage)}>
              Open Full Purchase Order
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAndClose(onDuplicate)}
            >
              Duplicate
            </button>
            {onPrint ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => runAndClose(onPrint)}
              >
                Download PDF
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => runAndClose(onConvertToInvoice)}
            >
              Convert to Invoice
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => runAndClose(onDelete)}
            >
              Delete
            </button>
          </div>
        </details>
        <button
          className="po-drawer-close"
          aria-label="Close purchase order drawer"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
