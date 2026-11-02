import { formatDateOnly, formatNumber } from "@/utils/format";
import { chainGaps, chainHeadline } from "@/utils/orderChain";
import { stageTone, type SupplyChainMapOrder } from "@/utils/supplyChainMap";

/**
 * The milestone strip under the supply-chain map: pick an order, read its
 * journey from order placed to delivered, and see which steps ran slow.
 */
export function OrderChainBar({
  orders,
  selectedId,
  averages,
  today,
  onSelect,
  onOpen,
}: {
  orders: SupplyChainMapOrder[];
  selectedId: string | null;
  averages: Array<number | null>;
  today: string;
  onSelect: (poId: string) => void;
  onOpen: (poId: string) => void;
}) {
  const order = orders.find((item) => item.poId === selectedId) ?? null;
  if (!order) return null;

  const gaps = chainGaps(order.chain, averages);
  const headline = chainHeadline(order.chain, today);

  return (
    <div className="order-chain" aria-label={`Milestones for ${order.poNumber}`}>
      <div className="order-chain-top">
        <div className="order-chain-chips" role="tablist" aria-label="Factory orders">
          {orders.map((item) => (
            <button
              key={item.poId}
              type="button"
              role="tab"
              aria-selected={item.poId === order.poId}
              className={`order-chain-chip${item.poId === order.poId ? " is-on" : ""}`}
              onClick={() => onSelect(item.poId)}
            >
              <i className={`map-tone-dot-${item.late ? "late" : stageTone(item.stage)}`} aria-hidden="true" />
              {item.poNumber}
            </button>
          ))}
        </div>
        <p className="order-chain-summary">
          {headline ? (
            <>
              <strong>{headline.days} days</strong> {headline.text}
              {headline.eta ? ` · delivered ~${formatDateOnly(headline.eta)}` : ""}
            </>
          ) : (
            "Add dates on the order to start the clock"
          )}
          <span className="order-chain-meta">
            {formatNumber(order.units)} pairs · {order.shipMode}
          </span>
        </p>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onOpen(order.poId)}>
          Open order
        </button>
      </div>

      <ol className="order-chain-track" key={order.poId}>
        {order.chain.map((milestone, index) => {
          const gap = gaps[index];
          const when = milestone.date ?? milestone.expected;
          const state = milestone.date ? "done" : milestone.expected ? "expected" : "none";
          return (
            <li key={milestone.stage} className={`order-chain-step is-${state}`}>
              <i className={milestone.date ? `order-chain-dot phase-${milestone.phase}` : "order-chain-dot"} aria-hidden="true" />
              <span className="order-chain-label">{milestone.label}</span>
              <strong className="order-chain-date">
                {when ? `${milestone.date ? "" : "~"}${formatDateOnly(when).replace(/, \d{4}$/, "")}` : "–"}
              </strong>
              {gap ? (
                <span className={`order-chain-gap${gap.pace ? ` is-${gap.pace}` : ""}`}>
                  +{gap.days}d{gap.average != null ? <em> avg {gap.average}</em> : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
