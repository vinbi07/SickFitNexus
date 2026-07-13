import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import {
  PurchaseOrderDetailsForm,
  buildFormStateFromPurchaseOrder,
  buildGeneralInfoPatch,
  type PurchaseOrderDrawerFormState,
} from "@/components/PurchaseOrderDetailsForm";
import { PurchaseOrderDrawerFooter } from "@/components/PurchaseOrderDrawerFooter";
import { PurchaseOrderDrawerHeader } from "@/components/PurchaseOrderDrawerHeader";
import { PurchaseOrderSummary } from "@/components/PurchaseOrderSummary";
import type { PurchaseOrderDrawerMode } from "@/hooks/usePurchaseOrderDrawer";
import { useAsyncData } from "@/hooks/useAsyncData";
import type { PurchaseOrder } from "@/types/domain";
import { buyerService } from "@/services/buyerService";
import { invoiceService } from "@/services/invoiceService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import { getErrorMessage } from "@/utils/errors";
import { printPurchaseOrderDocument } from "@/utils/purchaseOrderActions";
import { buildPurchaseOrderDocumentHtml } from "@/utils/purchaseOrderDocument";

const TITLE_ID = "po-drawer-title";

export function PurchaseOrderDrawer({
  purchaseOrderId,
  open,
  mode,
  canEdit,
  onClose,
  onSaved,
  onDeleted,
  onOpenFullPage,
  onDuplicate,
  onConvertedToInvoice,
}: {
  purchaseOrderId: string | null;
  open: boolean;
  mode: PurchaseOrderDrawerMode;
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (updated: PurchaseOrder) => void;
  onDeleted?: () => void;
  onOpenFullPage: (id: string) => void;
  onDuplicate: (id: string) => void;
  onConvertedToInvoice: (invoiceId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const initializedForIdRef = useRef<string | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const [formState, setFormState] = useState<PurchaseOrderDrawerFormState | null>(null);
  const [initialFormState, setInitialFormState] = useState<PurchaseOrderDrawerFormState | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [overflowBusy, setOverflowBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => (open && purchaseOrderId ? purchaseOrderService.getById(purchaseOrderId) : Promise.resolve(null)),
    [purchaseOrderId, open],
  );

  const { data: options } = useAsyncData(async () => {
    if (!open) return null;
    const [vendors, retailers, buyers, locations] = await Promise.all([
      vendorService.list(),
      retailerService.list(),
      buyerService.list(),
      supportService.listLocations(),
    ]);
    return { vendors, retailers, buyers, locations };
  }, [open]);

  useEffect(() => {
    if (data?.purchaseOrder && initializedForIdRef.current !== data.purchaseOrder.id) {
      const next = buildFormStateFromPurchaseOrder(data.purchaseOrder);
      setFormState(next);
      setInitialFormState(next);
      initializedForIdRef.current = data.purchaseOrder.id;
    }
    if (!data && initializedForIdRef.current) {
      initializedForIdRef.current = null;
    }
  }, [data]);

  useEffect(() => {
    if (open) setEditMode(mode === "edit" && canEdit);
  }, [open, mode, canEdit, purchaseOrderId]);

  useEffect(() => {
    setNotice(null);
    setShowDiscardDialog(false);
    setDeleteConfirmOpen(false);
  }, [purchaseOrderId]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, purchaseOrderId]);

  const isDirty = JSON.stringify(formState) !== JSON.stringify(initialFormState);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        requestClose();
      } else if (event.key === "Tab" && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty, purchaseOrderId]);

  function requestAction(action: () => void) {
    if (!isDirty) {
      action();
      return;
    }
    pendingActionRef.current = action;
    setShowDiscardDialog(true);
  }

  function requestClose() {
    requestAction(() => onClose());
  }

  function handleDiscardConfirmed() {
    setShowDiscardDialog(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }

  function handleOpenFullPage() {
    if (!purchaseOrderId) return;
    requestAction(() => {
      onOpenFullPage(purchaseOrderId);
      onClose();
    });
  }

  function handleDuplicate() {
    if (!purchaseOrderId) return;
    requestAction(() => {
      onDuplicate(purchaseOrderId);
      onClose();
    });
  }

  async function convertToInvoice() {
    if (!purchaseOrderId) return;
    setOverflowBusy(true);
    try {
      const invoice = await invoiceService.convertFromPo(purchaseOrderId);
      if (data) onSaved?.(data.purchaseOrder);
      onConvertedToInvoice(invoice.id);
      onClose();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setOverflowBusy(false);
    }
  }

  function handleConvertToInvoice() {
    requestAction(() => void convertToInvoice());
  }

  function handlePrint() {
    if (!data) return;
    const html = buildPurchaseOrderDocumentHtml(data.purchaseOrder, data.lineItems, data.purchaseOrder.buyers ?? null, data.purchaseOrder.retailers ?? null);
    printPurchaseOrderDocument(`PO ${data.purchaseOrder.po_number}`, html);
  }

  async function handleDeleteConfirmed() {
    if (!purchaseOrderId) return;
    setDeleting(true);
    try {
      await purchaseOrderService.remove(purchaseOrderId);
      setDeleteConfirmOpen(false);
      onDeleted?.();
      onClose();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setDeleting(false);
    }
  }

  async function handleMarkAsPaid() {
    if (!purchaseOrderId) return;
    setMarkingPaid(true);
    try {
      const updated = await purchaseOrderService.markAsPaid(purchaseOrderId);
      await reload();
      onSaved?.(updated);
      setNotice({ tone: "success", message: "Purchase order marked as paid." });
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleSave() {
    if (!formState || !purchaseOrderId || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const patch = buildGeneralInfoPatch(formState);
      const updated = await purchaseOrderService.updateGeneralInfo(purchaseOrderId, patch);
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (!purchaseOrderId) return null;

  const po = data?.purchaseOrder;
  const isManufacturerPo = po?.po_type === "Manufacturer PO";

  return (
    <>
      {open ? <div className="po-drawer-backdrop" onClick={requestClose} /> : null}
      <div
        className={`po-drawer ${open ? "po-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={panelRef}
        tabIndex={-1}
      >
        {!po ? (
          <div className="po-drawer-body">
            {loading ? <LoadingState message="Loading purchase order..." /> : null}
            {!loading && error ? (
              <ErrorState message="This purchase order could not be found. It may have been deleted." />
            ) : null}
            <div className="po-drawer-footer">
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <PurchaseOrderDrawerHeader
              purchaseOrder={po}
              titleId={TITLE_ID}
              onClose={requestClose}
              onOpenFullPage={handleOpenFullPage}
              onDuplicate={handleDuplicate}
              onPrint={!isManufacturerPo ? handlePrint : undefined}
              onConvertToInvoice={handleConvertToInvoice}
              onDelete={() => setDeleteConfirmOpen(true)}
              busy={overflowBusy || deleting}
            />
            <div className="po-drawer-body">
              {notice ? (
                <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} />
              ) : null}
              {formState ? (
                <PurchaseOrderDetailsForm
                  purchaseOrder={po}
                  formState={formState}
                  onChange={(key, value) =>
                    setFormState((current) => (current ? { ...current, [key]: value } : current))
                  }
                  readOnly={!canEdit || !editMode}
                  vendors={options?.vendors ?? []}
                  retailers={options?.retailers ?? []}
                  buyers={options?.buyers ?? []}
                  locations={options?.locations ?? []}
                  onMarkAsPaid={() => void handleMarkAsPaid()}
                  markingAsPaid={markingPaid}
                />
              ) : null}
              <PurchaseOrderSummary purchaseOrder={po} lineItemCount={data.lineItems.length} />
              <button type="button" className="btn btn-secondary" onClick={handleOpenFullPage}>
                Open Full Purchase Order
              </button>
            </div>
            <PurchaseOrderDrawerFooter
              canEdit={canEdit}
              editMode={editMode}
              saving={saving}
              onCancel={requestClose}
              onSave={() => void handleSave()}
              onEnableEdit={() => setEditMode(true)}
            />
          </>
        )}
      </div>
      {showDiscardDialog ? (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="You have unsaved changes to this purchase order. Continue editing or discard your changes."
          confirmLabel="Discard Changes"
          cancelLabel="Continue Editing"
          tone="danger"
          onConfirm={handleDiscardConfirmed}
          onClose={() => setShowDiscardDialog(false)}
        />
      ) : null}
      {deleteConfirmOpen ? (
        <ConfirmDialog
          title={`Delete PO ${po?.po_number ?? ""}?`}
          message="This will permanently delete the purchase order and its line items. This cannot be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={() => void handleDeleteConfirmed()}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}
