import type { PurchaseOrder, PurchaseOrderStatusHistory } from "@/types/domain";

export const RETAIL_PO_STEPS = ["Received", "Approved", "Queued", "Fulfilled", "Shipped", "Delivered", "Paid"] as const;
export type RetailPoStep = (typeof RETAIL_PO_STEPS)[number];

export const RETAIL_STEP_LABELS: Record<RetailPoStep, string> = {
  Received: "Order received",
  Approved: "Approved",
  Queued: "Queued to pick",
  Fulfilled: "Fulfilled",
  Shipped: "Shipped",
  Delivered: "Delivered",
  Paid: "Paid",
};

/** Where each step's date is stored. Fulfilled comes from status history, so it has none. */
export const RETAIL_STEP_COLUMNS: Record<
  RetailPoStep,
  "submitted_at" | "approved_at" | "queued_for_fulfillment_at" | "ship_date" | "actual_delivery_date" | "invoice_paid_at" | null
> = {
  Received: "submitted_at",
  Approved: "approved_at",
  Queued: "queued_for_fulfillment_at",
  Fulfilled: null,
  Shipped: "ship_date",
  Delivered: "actual_delivery_date",
  Paid: "invoice_paid_at",
};

export interface RetailTimelineStep {
  step: RetailPoStep;
  label: string;
  /** Date the step happened, when we know it. */
  date: string | null;
  /** Step happened. A done step can still lack a date (older orders, skipped queue). */
  done: boolean;
  /** Planned date for a step not done yet (ship window, ETA). */
  expected: string | null;
  state: "done" | "next" | "todo" | "cancelled";
}

export interface RetailTimeline {
  steps: RetailTimelineStep[];
  alert: { severity: "late" | "soon" | "hold"; message: string } | null;
  cancelledOn: string | null;
}

type TimelinePo = Pick<
  PurchaseOrder,
  | "status"
  | "approval_status"
  | "allocation_status"
  | "submitted_at"
  | "order_date"
  | "created_at"
  | "approved_at"
  | "queued_for_fulfillment_at"
  | "ship_date"
  | "actual_delivery_date"
  | "invoice_paid_at"
  | "cancelled_at"
  | "start_ship_date"
  | "ship_complete_date"
  | "eta_date"
  | "expected_delivery_date"
>;

const SOON_DAYS = 5;
const SHIPPED_STATUSES = new Set(["In Transit", "Partially Received", "Received", "Closed"]);
const DELIVERED_STATUSES = new Set(["Received", "Closed"]);
const HOLD_STATUSES: Record<string, string> = {
  "On Hold": "On hold",
  Countered: "Countered, waiting on the buyer",
  "Issue Flagged": "Issue flagged",
  "Pending Approval": "Waiting for approval",
};

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** Earliest time the status history shows the order moving into `status`. */
function firstHistoryDate(history: PurchaseOrderStatusHistory[], status: string) {
  return (
    history
      .filter((entry) => entry.to_status === status)
      .map((entry) => day(entry.created_at))
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null
  );
}

/**
 * The retail (wholesale) PO journey, built from the dates the order already
 * records. Received → Delivered is a chain, so a later step marks the earlier
 * ones done; Paid stands on its own because buyers can pay before or after delivery.
 */
export function retailPoTimeline(
  po: TimelinePo,
  history: PurchaseOrderStatusHistory[],
  today: string,
): RetailTimeline {
  const fulfilledStatus = po.status === "Fulfilled" || po.allocation_status === "Fulfilled";
  const dates: Record<RetailPoStep, string | null> = {
    Received: day(po.submitted_at) ?? day(po.order_date) ?? day(po.created_at),
    Approved: day(po.approved_at),
    Queued: day(po.queued_for_fulfillment_at),
    Fulfilled: firstHistoryDate(history, "Fulfilled"),
    Shipped: day(po.ship_date),
    Delivered: day(po.actual_delivery_date),
    Paid: day(po.invoice_paid_at),
  };
  const flags: Record<RetailPoStep, boolean> = {
    Received: true,
    Approved: Boolean(dates.Approved) || po.approval_status === "Approved",
    Queued: Boolean(dates.Queued) || po.allocation_status === "Queued for Fulfillment" || fulfilledStatus,
    Fulfilled: Boolean(dates.Fulfilled) || fulfilledStatus,
    Shipped: Boolean(dates.Shipped) || SHIPPED_STATUSES.has(po.status),
    Delivered: Boolean(dates.Delivered) || DELIVERED_STATUSES.has(po.status),
    Paid: Boolean(dates.Paid),
  };

  // A later step in the chain means every earlier one happened.
  const chain = RETAIL_PO_STEPS.filter((step) => step !== "Paid");
  let furthest = -1;
  chain.forEach((step, i) => {
    if (flags[step]) furthest = i;
  });
  chain.forEach((step, i) => {
    if (i <= furthest) flags[step] = true;
  });

  const cancelled = po.status === "Cancelled";
  const expected: Partial<Record<RetailPoStep, string | null>> = {
    Shipped: day(po.ship_complete_date) ?? day(po.start_ship_date),
    Delivered: day(po.eta_date) ?? day(po.expected_delivery_date),
  };

  const steps = RETAIL_PO_STEPS.map((step): RetailTimelineStep => {
    const done = flags[step];
    const chainIndex = chain.indexOf(step as (typeof chain)[number]);
    let state: RetailTimelineStep["state"];
    if (done) state = "done";
    else if (cancelled) state = "cancelled";
    else if (step === "Paid") state = flags.Delivered ? "next" : "todo";
    else state = chainIndex === furthest + 1 ? "next" : "todo";
    return {
      step,
      label: RETAIL_STEP_LABELS[step],
      date: dates[step],
      done,
      expected: done ? null : (expected[step] ?? null),
      state,
    };
  });

  let alert: RetailTimeline["alert"] = null;
  const shipBy = day(po.ship_complete_date);
  if (!cancelled && !flags.Shipped && shipBy) {
    const left = daysBetween(today, shipBy);
    if (left < 0) alert = { severity: "late", message: `${-left} day${left === -1 ? "" : "s"} past the ship-by date` };
    else if (left <= SOON_DAYS) alert = { severity: "soon", message: left === 0 ? "Due to ship today" : `Due to ship in ${left} day${left === 1 ? "" : "s"}` };
  }
  if (!alert && !cancelled && HOLD_STATUSES[po.status]) {
    alert = { severity: "hold", message: HOLD_STATUSES[po.status] };
  }

  return { steps, alert, cancelledOn: cancelled ? (day(po.cancelled_at) ?? "") : null };
}
