import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NotificationBanner } from "@/components/NotificationBanner";
import { CalendarStatusBadge, CATEGORY_ICONS } from "@/components/calendar/CalendarViews";
import { getRecommendedNextAction } from "@/lib/calendar/calendarStatus";
import { CALENDAR_CATEGORY_LABELS, type CalendarEvent } from "@/lib/calendar/calendarTypes";
import { calendarService } from "@/services/calendarService";
import { complianceService } from "@/services/complianceService";
import { invoiceService } from "@/services/invoiceService";
import { productionPlanService } from "@/services/productionPlanService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { formatCurrency, formatDate } from "@/utils/format";
import { getErrorMessage } from "@/utils/errors";

const TITLE_ID = "calendar-event-drawer-title";

export function CalendarEventDrawer({
  event,
  open,
  onClose,
  onEditManual,
  onChanged,
}: {
  event: CalendarEvent | null;
  open: boolean;
  onClose: () => void;
  onEditManual: (event: CalendarEvent) => void;
  onChanged: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    setNotice(null);
    setDeleteConfirmOpen(false);
  }, [event?.id]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open, event?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!event) return null;

  async function runAction(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      onChanged();
      setNotice({ tone: "success", message: successMessage });
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteManual() {
    if (!event || event.category !== "manual" || !event.sourceId) return;
    setBusy(true);
    try {
      await calendarService.deleteManualEvent(event.sourceId);
      setDeleteConfirmOpen(false);
      onChanged();
      onClose();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const Icon = CATEGORY_ICONS[event.category];
  const recommendedAction = getRecommendedNextAction(event);
  const dateRangeLabel = event.metadata?.dueDateIsEstimated
    ? `${formatDate(event.date)} (estimated from payment terms)`
    : formatDate(event.date);

  return (
    <>
      {open ? <div className="po-drawer-backdrop" onClick={onClose} /> : null}
      <div
        className={`po-drawer calendar-event-drawer ${open ? "po-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        ref={panelRef}
        tabIndex={-1}
      >
        <div className="po-drawer-header">
          <div className="po-drawer-header-title">
            <span className="po-drawer-eyebrow">
              <Icon size={14} aria-hidden="true" /> {CALENDAR_CATEGORY_LABELS[event.category]}
            </span>
            <h3 id={TITLE_ID}>{event.title}</h3>
            <div className="po-drawer-header-meta">
              <CalendarStatusBadge status={event.status} />
              {event.priority ? <span className="status-badge status-neutral">{event.priority} priority</span> : null}
            </div>
          </div>
          <div className="po-drawer-header-actions">
            <button type="button" className="po-drawer-close" onClick={onClose} aria-label="Close event details">
              ✕
            </button>
          </div>
        </div>

        <div className="po-drawer-body">
          {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}

          <div className="detail-grid">
            <div className="detail-card">
              <span>Date</span>
              <strong>{dateRangeLabel}</strong>
            </div>
            {event.amount !== null ? (
              <div className="detail-card">
                <span>Amount</span>
                <strong>{formatCurrency(event.amount)}</strong>
              </div>
            ) : null}
            {event.retailerName ? (
              <div className="detail-card">
                <span>Retailer</span>
                <strong>{event.retailerName}</strong>
              </div>
            ) : null}
            {event.manufacturerName ? (
              <div className="detail-card">
                <span>Manufacturer</span>
                <strong>{event.manufacturerName}</strong>
              </div>
            ) : null}
            {event.productName ? (
              <div className="detail-card">
                <span>Product</span>
                <strong>{event.productName}</strong>
              </div>
            ) : null}
            {event.ownerLabel ? (
              <div className="detail-card">
                <span>Owner</span>
                <strong>{event.ownerLabel}</strong>
              </div>
            ) : null}
          </div>

          {event.description ? (
            <div className="po-drawer-section">
              <legend>Notes</legend>
              <p className="helper-text">{event.description}</p>
            </div>
          ) : null}

          {recommendedAction ? (
            <div className="po-drawer-section">
              <legend>Recommended Next Action</legend>
              <p className="helper-text">{recommendedAction}</p>
            </div>
          ) : null}

          {event.sourceHref ? (
            <Link className="btn btn-secondary" to={event.sourceHref} onClick={onClose}>
              Open Full Record
            </Link>
          ) : null}
        </div>

        <div className="po-drawer-footer">
          {event.category === "purchase_order" && event.sourceId ? (
            <>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void runAction(() => purchaseOrderService.markAsShipped(event.sourceId!), "Marked as shipped.")}
              >
                Mark Shipped
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void runAction(() => purchaseOrderService.approve(event.sourceId!), "Purchase order approved.")}
              >
                Approve
              </button>
            </>
          ) : null}

          {event.category === "invoice" && event.sourceId ? (
            <>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void runAction(() => invoiceService.updateStatus(event.sourceId!, "Sent"), "Invoice marked as sent.")}
              >
                Mark Sent
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void runAction(() => invoiceService.updateStatus(event.sourceId!, "Paid"), "Invoice marked as paid.")}
              >
                Mark Paid
              </button>
            </>
          ) : null}

          {event.category === "production" && event.sourceId ? (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void runAction(() => productionPlanService.updateStatus(event.sourceId!, "Approved"), "Production plan approved.")}
            >
              Approve Plan
            </button>
          ) : null}

          {event.category === "compliance" && event.sourceType === "compliance_requirement" && event.sourceId ? (
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void runAction(() => complianceService.upsertRequirement({ id: event.sourceId!, status: "Renewing" }), "Marked as renewing.")}
            >
              Mark Renewing
            </button>
          ) : null}

          {event.category === "manual" ? (
            <>
              <button className="btn btn-secondary" disabled={busy} onClick={() => onEditManual(event)}>
                Edit
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  void runAction(() => calendarService.updateManualEvent(event.sourceId!, { status: "completed" }), "Marked complete.")
                }
              >
                Mark Complete
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => setDeleteConfirmOpen(true)}>
                Delete
              </button>
            </>
          ) : null}

          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {deleteConfirmOpen ? (
        <ConfirmDialog
          title="Delete this event?"
          message="This will permanently delete this manual calendar event. This cannot be undone."
          confirmLabel="Delete"
          busy={busy}
          onConfirm={() => void handleDeleteManual()}
          onClose={() => setDeleteConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}
