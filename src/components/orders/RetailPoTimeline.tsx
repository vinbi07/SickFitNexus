import { useEffect, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type { PurchaseOrder, PurchaseOrderStatusHistory } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";
import { formatDateOnly } from "@/utils/format";
import {
  RETAIL_PO_STEPS,
  RETAIL_STEP_COLUMNS,
  retailPoTimeline,
  type RetailPoStep,
} from "@/utils/retailPoTimeline";

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * Where a retail (wholesale) PO is, from order received to paid. Steps move
 * forward through the page actions; a step that already happened can be
 * clicked to correct (or fill in) its date.
 */
export function RetailPoTimeline({
  purchaseOrder,
  statusHistory,
  onChanged,
}: {
  purchaseOrder: PurchaseOrder;
  statusHistory: PurchaseOrderStatusHistory[];
  /** Reload after a date is saved. Without it the timeline is read-only. */
  onChanged?: () => Promise<unknown> | void;
}) {
  const today = todayIso();
  const { steps, alert, cancelledOn } = retailPoTimeline(purchaseOrder, statusHistory, today);
  const shipStart = purchaseOrder.start_ship_date;
  const shipEnd = purchaseOrder.ship_complete_date;

  const [editing, setEditing] = useState<{ step: RetailPoStep; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => setEditing(null), [purchaseOrder]);

  const dateOf = (step: RetailPoStep) => steps.find((item) => item.step === step)?.date ?? null;
  // Keep a date between its recorded neighbours; Paid only has to follow the order.
  const bounds = (step: RetailPoStep) => {
    if (step === "Paid") return { min: dateOf("Received"), max: today };
    const chain = RETAIL_PO_STEPS.filter((item) => item !== "Paid");
    const i = chain.indexOf(step);
    const before = chain.slice(0, i).map(dateOf).filter(Boolean).pop() ?? null;
    const after = chain.slice(i + 1).map(dateOf).find(Boolean) ?? null;
    return { min: before, max: after && after < today ? after : today };
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    if (!onChanged) return;
    try {
      setBusy(true);
      setMessage(null);
      await action();
      await onChanged();
      setMessage({ tone: "success", text: success });
    } catch (error) {
      setMessage({ tone: "error", text: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    if (!editing) return;
    void run(
      () => purchaseOrderService.editRetailStepDate(purchaseOrder.id, editing.step, editing.date),
      "Date updated.",
    );
  };

  // What can be marked from here. Approve / Queue / Fulfill reserve or commit
  // stock, so those stay on the page actions; shipping, delivery and payment don't.
  const [markDate, setMarkDate] = useState(today);
  const stateOf = (step: RetailPoStep) => steps.find((item) => item.step === step)?.state;
  const nextChain = steps.find((item) => item.step !== "Paid" && item.state === "next")?.step ?? null;
  const canShip = nextChain === "Shipped";
  const canDeliver = nextChain === "Shipped" || nextChain === "Delivered";
  const canPay = stateOf("Paid") !== "done" && stateOf("Paid") !== "cancelled";
  const blockedBy =
    nextChain && !canDeliver ? steps.find((item) => item.step === nextChain)?.label ?? nextChain : null;
  const mark = (step: "Shipped" | "Delivered" | "Paid") =>
    void run(
      () => purchaseOrderService.markRetailStep(purchaseOrder.id, step, markDate),
      `Marked ${step.toLowerCase()}.`,
    );

  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>Order Timeline</h3>
        {cancelledOn != null ? (
          <span className="status-badge status-danger">
            Cancelled{cancelledOn ? ` ${formatDateOnly(cancelledOn)}` : ""}
          </span>
        ) : alert ? (
          <span className={`status-badge ${alert.severity === "late" ? "status-danger" : "status-warning"}`}>
            {alert.message}
          </span>
        ) : null}
      </div>
      {shipStart || shipEnd ? (
        <p className="helper-text">
          Ship window:{" "}
          {shipStart && shipEnd
            ? `${formatDateOnly(shipStart)} – ${formatDateOnly(shipEnd)}`
            : shipEnd
              ? `by ${formatDateOnly(shipEnd)}`
              : `from ${formatDateOnly(shipStart!)}`}
        </p>
      ) : null}

      <ol className="stage-track">
        {steps.map((step) => {
          const late = step.step === "Shipped" && step.state === "next" && alert?.severity === "late";
          const className = `stage-step stage-step--${step.state}${late ? " stage-step--late" : ""}${
            editing?.step === step.step ? " stage-step--editing" : ""
          }`;
          const content = (
            <>
              <span className="stage-dot" aria-hidden="true" />
              <span className="stage-text">
                <strong>{step.label}</strong>
                <span className="helper-text">
                  {step.date
                    ? formatDateOnly(step.date)
                    : step.done
                      ? "Done · add date"
                      : step.state === "cancelled"
                        ? "Cancelled"
                        : step.expected
                          ? `Expected ${formatDateOnly(step.expected)}`
                          : "Not yet"}
                </span>
              </span>
            </>
          );
          const editable = Boolean(onChanged) && step.done && RETAIL_STEP_COLUMNS[step.step] != null;
          return editable ? (
            <li key={step.step} className="stage-step-item">
              <button
                type="button"
                className={`${className} stage-step--clickable`}
                aria-pressed={editing?.step === step.step}
                title={`Change the ${step.label} date`}
                onClick={() => {
                  setMessage(null);
                  setEditing(
                    editing?.step === step.step ? null : { step: step.step, date: step.date ?? today },
                  );
                }}
              >
                {content}
              </button>
            </li>
          ) : (
            <li key={step.step} className={className}>
              {content}
            </li>
          );
        })}
      </ol>

      {editing ? (
        <div className="form-grid stage-edit">
          <div className="field field-half">
            <DatePickerField
              label={`${steps.find((item) => item.step === editing.step)?.label ?? editing.step} date`}
              value={editing.date}
              minDate={bounds(editing.step).min}
              maxDate={bounds(editing.step).max}
              onChange={(value) => setEditing({ ...editing, date: value ?? editing.date })}
            />
          </div>
          <div className="field field-half stage-mark-action">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !editing.date || editing.date === dateOf(editing.step)}
              onClick={save}
            >
              {busy ? "Saving..." : "Save date"}
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {onChanged && !editing && cancelledOn == null && (canDeliver || canPay) ? (
        <div className="form-grid">
          <div className="field field-half">
            <DatePickerField
              label="Date"
              value={markDate}
              minDate={dateOf("Received")}
              maxDate={today}
              onChange={(value) => setMarkDate(value ?? today)}
            />
          </div>
          <div className="field field-half stage-mark-action">
            {canShip ? (
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => mark("Shipped")}>
                {busy ? "Saving..." : "Mark shipped"}
              </button>
            ) : null}
            {canDeliver ? (
              <button
                className={`btn ${canShip ? "btn-secondary" : "btn-primary"}`}
                type="button"
                disabled={busy}
                onClick={() => mark("Delivered")}
              >
                Mark delivered
              </button>
            ) : null}
            {canPay ? (
              <button
                className={`btn ${canDeliver ? "btn-ghost" : "btn-primary"}`}
                type="button"
                disabled={busy}
                onClick={() => mark("Paid")}
              >
                Mark paid
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {onChanged && !editing && blockedBy ? (
        <p className="helper-text">
          Next up: {blockedBy}. Use the {blockedBy === "Queued to pick" ? "Queue for fulfillment" : blockedBy === "Approved" ? "Approve" : "Fulfill"} action
          on the full PO page first. It reserves or commits stock, so shipped and delivered open up after it.
        </p>
      ) : null}
      {message ? <p className={message.tone === "success" ? "success-text" : "danger-text"}>{message.text}</p> : null}
    </div>
  );
}
