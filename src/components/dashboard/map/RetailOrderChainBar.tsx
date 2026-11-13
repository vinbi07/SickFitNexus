import type { CSSProperties } from "react";
import type { DashboardSnapshot } from "@/types/domain";
import { formatCurrency, formatDateOnly, formatNumber } from "@/utils/format";
import type { RetailPoStep } from "@/utils/retailPoTimeline";

type RetailMapOrder = DashboardSnapshot["retailTimelineOrders"][number];

/** Colours borrowed from the supply chain bar: waiting → packing → in transit → landed. */
const STEP_PHASE: Record<RetailPoStep, "wait" | "prod" | "pack" | "ship" | "recv"> = {
  Received: "wait",
  Approved: "wait",
  Queued: "pack",
  Fulfilled: "pack",
  Shipped: "ship",
  Delivered: "recv",
  Paid: "prod",
};

const CHIP_LIMIT = 12;

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

function chipTone(order: RetailMapOrder) {
  if (order.alert?.severity === "late") return "late";
  const reached = [...order.steps].reverse().find((step) => step.done && step.step !== "Paid")?.step;
  if (reached === "Delivered") return "received";
  if (reached === "Shipped") return "transit";
  if (reached === "Fulfilled" || reached === "Queued") return "production";
  return "waiting";
}

/**
 * The milestone strip under the retail PO map: pick an account's order and read
 * its journey from order received to paid, like the supply chain bar does for factory orders.
 */
export function RetailOrderChainBar({
  orders,
  selectedId,
  today,
  onSelect,
  onOpen,
  onShowAll,
}: {
  orders: RetailMapOrder[];
  selectedId: string | null;
  today: string;
  onSelect: (poId: string) => void;
  onOpen: (poId: string) => void;
  onShowAll: () => void;
}) {
  const order = orders.find((item) => item.poId === selectedId) ?? null;
  if (!order) return null;

  // Keep the selected order visible even when it sits past the chip limit.
  const chips = orders.slice(0, CHIP_LIMIT);
  if (!chips.includes(order)) chips.push(order);
  const hidden = orders.length - chips.length;

  const received = order.steps.find((step) => step.step === "Received")?.date ?? null;
  const delivered = order.steps.find((step) => step.step === "Delivered")?.date ?? null;

  return (
    <div className="order-chain" aria-label={`Milestones for ${order.account} (${order.poNumber})`}>
      <div className="order-chain-top">
        <div className="order-chain-chips" role="tablist" aria-label="Retail orders">
          {chips.map((item) => (
            <button
              key={item.poId}
              type="button"
              role="tab"
              aria-selected={item.poId === order.poId}
              className={`order-chain-chip${item.poId === order.poId ? " is-on" : ""}`}
              title={item.poNumber}
              aria-label={item.account === item.poNumber ? item.poNumber : `${item.account} (${item.poNumber})`}
              onClick={() => onSelect(item.poId)}
            >
              <i className={`map-tone-dot-${chipTone(item)}`} aria-hidden="true" />
              {item.account}
            </button>
          ))}
          {hidden > 0 ? (
            <button type="button" className="order-chain-chip" onClick={onShowAll}>
              +{hidden} more
            </button>
          ) : null}
        </div>
        <p className="order-chain-summary">
          <span>
            <span className="order-chain-po">{order.poNumber}</span>
            {" · "}
            {received ? (
              delivered ? (
                <>
                  <strong>{daysBetween(received, delivered)} days</strong> order to delivery
                </>
              ) : (
                <>
                  <strong>{daysBetween(received, today)} days</strong> since order received
                </>
              )
            ) : (
              "No order date yet"
            )}
          </span>
          {order.alert ? (
            <span className={order.alert.severity === "late" ? "order-chain-gap is-slow" : "order-chain-gap"}>
              {order.alert.message}
            </span>
          ) : order.shipEnd ? (
            <span className="order-chain-meta">Ship by {formatDateOnly(order.shipEnd)}</span>
          ) : null}
          <span className="order-chain-meta">
            {formatNumber(order.units)} pairs · {formatCurrency(order.value)}
          </span>
        </p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(order.poId)}>
          Open order
        </button>
      </div>

      <ol className="order-chain-track" style={{ "--chain-steps": order.steps.length } as CSSProperties} key={order.poId}>
        {order.steps.map((step) => {
          const when = step.date ?? step.expected;
          const state = step.done ? "done" : step.expected ? "expected" : "none";
          return (
            <li key={step.step} className={`order-chain-step is-${state}`}>
              <i
                className={step.done ? `order-chain-dot phase-${STEP_PHASE[step.step]}` : "order-chain-dot"}
                aria-hidden="true"
              />
              <span className="order-chain-label">{step.label}</span>
              <strong className="order-chain-date">
                {when
                  ? `${step.date ? "" : "~"}${formatDateOnly(when).replace(/, \d{4}$/, "")}`
                  : step.done
                    ? "✓"
                    : step.state === "cancelled"
                      ? "Cancelled"
                      : "–"}
              </strong>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
