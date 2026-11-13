import { useEffect, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { useAsyncData } from "@/hooks/useAsyncData";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { supplyChainService } from "@/services/supplyChainService";
import type { PurchaseOrder } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";
import { formatDateOnly } from "@/utils/format";
import { DEFAULT_LEAD_TIME_SETTINGS, type ShipMode } from "@/utils/leadTime";
import {
  currentStageIndex,
  expectedStageDates,
  freightModeComparison,
  landedCostPerPair,
  nextStageOptions,
  PRODUCTION_STAGES,
  shipModeOf,
  stageAlert,
  stageDates,
  stageLabel,
  type ProductionStage,
} from "@/utils/productionStage";

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);

export function ProductionStageTimeline({
  purchaseOrder,
  onChanged,
  onReceive,
}: {
  purchaseOrder: PurchaseOrder;
  onChanged: () => Promise<void> | void;
  /** Opens the existing receive-inventory flow, which owns the Received stage. */
  onReceive?: () => void;
}) {
  const { data } = useAsyncData(
    () => Promise.all([supplyChainService.getSettings(), supplyChainService.listShutdowns()]),
    [],
  );
  const settings = data?.[0] ?? null;
  const shutdowns = data?.[1] ?? [];
  const context = {
    settings: settings ?? { ...DEFAULT_LEAD_TIME_SETTINGS },
    shutdowns,
    today: todayIso(),
  };

  const [markDate, setMarkDate] = useState(todayIso());
  const [shipMode, setShipMode] = useState<ShipMode>(shipModeOf(purchaseOrder));
  const [freight, setFreight] = useState(purchaseOrder.freight_cost != null ? String(purchaseOrder.freight_cost) : "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  // A stage the order has already passed, opened for a date correction.
  const [editing, setEditing] = useState<{ stage: ProductionStage; date: string } | null>(null);

  useEffect(() => {
    setShipMode(shipModeOf(purchaseOrder));
    setFreight(purchaseOrder.freight_cost != null ? String(purchaseOrder.freight_cost) : "");
    setEditing(null);
  }, [purchaseOrder]);

  const dates = stageDates(purchaseOrder);
  // Keep a corrected date between the recorded stages on either side of it.
  const editBounds = (stage: ProductionStage) => {
    const i = PRODUCTION_STAGES.indexOf(stage);
    const before = PRODUCTION_STAGES.slice(0, i).map((s) => dates[s]).filter(Boolean).pop() ?? null;
    const after = PRODUCTION_STAGES.slice(i + 1).map((s) => dates[s]).find(Boolean) ?? null;
    const today = todayIso();
    return { min: before, max: after && after < today ? after : today };
  };
  const index = currentStageIndex(purchaseOrder);
  // The next stage, plus the one after it when the next can be skipped (US labels).
  const [next = null, skipTo = null] = nextStageOptions(purchaseOrder);
  const projection = expectedStageDates(purchaseOrder, context);
  const alert = stageAlert(purchaseOrder, context);
  const landed = landedCostPerPair(purchaseOrder);
  const comparison = settings ? freightModeComparison(purchaseOrder, settings) : null;
  const shippingDirty =
    shipMode !== shipModeOf(purchaseOrder) ||
    freight !== (purchaseOrder.freight_cost != null ? String(purchaseOrder.freight_cost) : "");

  const run = async (action: () => Promise<unknown>, success: string) => {
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

  return (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>Production Timeline</h3>
        {alert ? (
          <span className={`status-badge ${alert.severity === "late" ? "status-danger" : "status-warning"}`}>
            {alert.message}
          </span>
        ) : null}
      </div>
      <p className="helper-text">
        Expected dates count from the Paid date using the lead times in Settings
        {projection?.shutdownsApplied.length
          ? `, pushed out for ${projection.shutdownsApplied.join(", ")}`
          : ""}
        .{!settings ? " Lead-time settings didn't load, so planning defaults are shown." : ""}
      </p>

      <ol className="stage-track">
        {PRODUCTION_STAGES.map((stage, i) => {
          const actual = dates[stage];
          const expected = projection?.expected[stage] ?? null;
          const state = i <= index ? "done" : i === index + 1 ? "next" : "todo";
          const late = state !== "done" && alert?.stage === stage && alert.severity === "late";
          const content = (
            <>
              <span className="stage-dot" aria-hidden="true" />
              <span className="stage-text">
                <strong>{stageLabel(stage)}</strong>
                <span className="helper-text">
                  {actual
                    ? formatDateOnly(actual)
                    : expected
                      ? `Expected ${formatDateOnly(expected)}`
                      : state === "done"
                        ? "Skipped"
                        : "Not yet"}
                </span>
              </span>
            </>
          );
          const className = `stage-step stage-step--${state}${late ? " stage-step--late" : ""}${
            editing?.stage === stage ? " stage-step--editing" : ""
          }`;
          // Stages already reached (with a date) can be clicked to correct their date.
          return actual ? (
            <li key={stage} className="stage-step-item">
              <button
                type="button"
                className={`${className} stage-step--clickable`}
                aria-pressed={editing?.stage === stage}
                title={`Change the ${stageLabel(stage)} date`}
                onClick={() => {
                  setMessage(null);
                  setEditing(editing?.stage === stage ? null : { stage, date: actual });
                }}
              >
                {content}
              </button>
            </li>
          ) : (
            <li key={stage} className={className}>
              {content}
            </li>
          );
        })}
      </ol>

      {editing ? (
        <div className="form-grid stage-edit">
          <div className="field field-half">
            <DatePickerField
              label={`${stageLabel(editing.stage)} date`}
              value={editing.date}
              minDate={editBounds(editing.stage).min}
              maxDate={editBounds(editing.stage).max}
              onChange={(value) => setEditing({ ...editing, date: value ?? editing.date })}
            />
          </div>
          <div className="field field-half stage-mark-action">
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy || !editing.date || editing.date === dates[editing.stage]}
              onClick={() =>
                run(
                  () => purchaseOrderService.editStageDate(purchaseOrder.id, editing.stage, editing.date),
                  `${stageLabel(editing.stage)} date updated.`,
                )
              }
            >
              {busy ? "Saving..." : "Save date"}
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {next ? (
        <div className="form-grid">
          {next === "Received" ? (
            <div className="field field-wide">
              <p className="helper-text">
                Receiving updates stock, so mark this order received with Receive Inventory.
              </p>
              {onReceive ? (
                <div className="btn-row">
                  <button className="btn btn-secondary btn-small" type="button" onClick={onReceive}>
                    Receive Inventory
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="field field-half">
                <DatePickerField
                  label={`${stageLabel(next)} date`}
                  value={markDate}
                  maxDate={todayIso()}
                  onChange={(value) => setMarkDate(value ?? todayIso())}
                />
              </div>
              <div className="field field-half stage-mark-action">
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={busy || !markDate}
                  onClick={() =>
                    run(
                      () => purchaseOrderService.setProductionStage(purchaseOrder.id, next, markDate),
                      `Marked ${stageLabel(next)}.`,
                    )
                  }
                >
                  {busy ? "Saving..." : `Mark ${stageLabel(next)}`}
                </button>
                {skipTo ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy || !markDate}
                    onClick={() =>
                      run(
                        () => purchaseOrderService.setProductionStage(purchaseOrder.id, skipTo, markDate),
                        `Marked ${stageLabel(skipTo)}.`,
                      )
                    }
                  >
                    Skip to {stageLabel(skipTo)}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field field-half">
          <label>Ship mode</label>
          <select value={shipMode} onChange={(event) => setShipMode(event.target.value as ShipMode)}>
            <option value="Sea">Sea</option>
            <option value="Air">Air</option>
          </select>
        </div>
        <div className="field field-half">
          <label>Freight cost ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={freight}
            onChange={(event) => setFreight(event.target.value)}
          />
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-card">
          <span>Landed cost / pair</span>
          <strong>{landed != null ? money(landed) : "Add units"}</strong>
        </div>
        {comparison ? (
          <div className="detail-card">
            <span>{comparison.label}</span>
            <strong>{money(comparison.amount)}</strong>
          </div>
        ) : null}
      </div>
      {shippingDirty ? (
        <div className="btn-row">
          <button
            className="btn btn-secondary btn-small"
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  purchaseOrderService.updateShipping(purchaseOrder.id, {
                    ship_mode: shipMode,
                    freight_cost: freight === "" ? null : Number(freight),
                  }),
                "Shipping saved.",
              )
            }
          >
            Save Shipping
          </button>
        </div>
      ) : null}
      {message ? <p className={message.tone === "success" ? "success-text" : "danger-text"}>{message.text}</p> : null}
    </div>
  );
}
