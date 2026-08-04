import { DEFAULT_PAYMENT_TERMS, type PoWizardAction, type PoWizardState } from "@/state/purchaseOrderWizardReducer";

export function isPoStepOrderDetailsValid(state: PoWizardState): boolean {
  return Boolean(state.header.po_number.trim()) && Boolean(state.header.order_date);
}

export function PoStepOrderDetails({
  state,
  dispatch,
}: {
  state: PoWizardState;
  dispatch: (action: PoWizardAction) => void;
}) {
  const set = (field: keyof typeof state.header, value: string) =>
    dispatch({ type: "SET_HEADER_FIELD", field, value });

  return (
    <div className="form-grid">
      <div className="field">
        <label>PO Number</label>
        <input value={state.header.po_number} onChange={(event) => set("po_number", event.target.value)} />
      </div>
      <div className="field">
        <label>Order Date</label>
        <input type="date" value={state.header.order_date} onChange={(event) => set("order_date", event.target.value)} />
      </div>
      <div className="field">
        <label>Start Ship Date</label>
        <input
          type="date"
          value={state.header.start_ship_date}
          onChange={(event) => set("start_ship_date", event.target.value)}
        />
      </div>
      <div className="field">
        <label>Ship Complete Date</label>
        <input
          type="date"
          value={state.header.ship_complete_date}
          onChange={(event) => set("ship_complete_date", event.target.value)}
        />
      </div>
      <div className="field">
        <label>Currency</label>
        <select value={state.header.currency_code} onChange={(event) => set("currency_code", event.target.value)}>
          <option value="USD">USD</option>
          <option value="CAD">CAD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>
      <div className="field">
        <label>Payment Terms</label>
        <input
          list="po-wizard-payment-terms"
          value={state.header.payment_terms_snapshot}
          onChange={(event) => set("payment_terms_snapshot", event.target.value)}
        />
        <datalist id="po-wizard-payment-terms">
          {DEFAULT_PAYMENT_TERMS.map((term) => (
            <option key={term} value={term} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
