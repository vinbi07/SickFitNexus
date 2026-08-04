import type { PoWizardAction, PoWizardState } from "@/state/purchaseOrderWizardReducer";

export function isPoStepAddressesValid(state: PoWizardState): boolean {
  return Boolean(state.header.bill_to_company_name.trim()) && Boolean(state.header.ship_to_company_name.trim());
}

export function PoStepAddresses({
  state,
  dispatch,
}: {
  state: PoWizardState;
  dispatch: (action: PoWizardAction) => void;
}) {
  const set = (field: keyof typeof state.header, value: string) =>
    dispatch({ type: "SET_HEADER_FIELD", field, value });

  return (
    <div className="po-builder-two-up">
      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="lookbook-kicker">Bill To</p>
            <h3>Billing Information</h3>
          </div>
        </div>
        <div className="form-grid">
          <div className="field field-half">
            <label>Company Name</label>
            <input value={state.header.bill_to_company_name} onChange={(event) => set("bill_to_company_name", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>Contact Name</label>
            <input value={state.header.bill_to_contact_name} onChange={(event) => set("bill_to_contact_name", event.target.value)} />
          </div>
          <div className="field field-wide">
            <label>Street Address</label>
            <input value={state.header.bill_to_street} onChange={(event) => set("bill_to_street", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>City</label>
            <input value={state.header.bill_to_city} onChange={(event) => set("bill_to_city", event.target.value)} />
          </div>
          <div className="field">
            <label>State</label>
            <input value={state.header.bill_to_state} onChange={(event) => set("bill_to_state", event.target.value)} />
          </div>
          <div className="field">
            <label>ZIP Code</label>
            <input value={state.header.bill_to_zip} onChange={(event) => set("bill_to_zip", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>Phone</label>
            <input value={state.header.bill_to_phone} onChange={(event) => set("bill_to_phone", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>Email</label>
            <input value={state.header.bill_to_email} onChange={(event) => set("bill_to_email", event.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="lookbook-kicker">Ship To</p>
            <h3>Shipping Information</h3>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => dispatch({ type: "COPY_BILL_TO_SHIP_TO" })}
          >
            Copy From Bill To
          </button>
        </div>
        <div className="form-grid">
          <div className="field field-half">
            <label>Company Name</label>
            <input value={state.header.ship_to_company_name} onChange={(event) => set("ship_to_company_name", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>Attention</label>
            <input value={state.header.ship_to_attention} onChange={(event) => set("ship_to_attention", event.target.value)} />
          </div>
          <div className="field field-wide">
            <label>Street Address</label>
            <input value={state.header.ship_to_street} onChange={(event) => set("ship_to_street", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>City</label>
            <input value={state.header.ship_to_city} onChange={(event) => set("ship_to_city", event.target.value)} />
          </div>
          <div className="field">
            <label>State</label>
            <input value={state.header.ship_to_state} onChange={(event) => set("ship_to_state", event.target.value)} />
          </div>
          <div className="field">
            <label>ZIP Code</label>
            <input value={state.header.ship_to_zip} onChange={(event) => set("ship_to_zip", event.target.value)} />
          </div>
          <div className="field field-half">
            <label>Phone</label>
            <input value={state.header.ship_to_phone} onChange={(event) => set("ship_to_phone", event.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}
