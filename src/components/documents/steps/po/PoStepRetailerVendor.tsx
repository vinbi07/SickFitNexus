import type { Buyer, Location, Retailer, Vendor } from "@/types/domain";
import type { PoWizardAction, PoWizardState } from "@/state/purchaseOrderWizardReducer";

export function isPoStepRetailerVendorValid(state: PoWizardState): boolean {
  return Boolean(state.header.retailer_id);
}

export function PoStepRetailerVendor({
  state,
  dispatch,
  retailers,
  buyers,
  locations,
  vendors,
}: {
  state: PoWizardState;
  dispatch: (action: PoWizardAction) => void;
  retailers: Retailer[];
  buyers: Buyer[];
  locations: Location[];
  vendors: Vendor[];
}) {
  const buyersForRetailer = buyers.filter(
    (buyer) => !state.header.retailer_id || buyer.retailer_id === state.header.retailer_id,
  );
  const locationsForRetailer = locations.filter(
    (location) => !state.header.retailer_id || location.retailer_id === state.header.retailer_id,
  );

  function applyRetailer(retailerId: string) {
    const retailer = retailers.find((entry) => entry.id === retailerId) ?? null;
    const buyer = buyers.find((entry) => entry.retailer_id === retailerId) ?? null;
    const location = locations.find((entry) => entry.retailer_id === retailerId) ?? null;
    dispatch({ type: "APPLY_RETAILER", retailer, buyer, location });
  }

  function applyBuyer(buyerId: string) {
    const buyer = buyers.find((entry) => entry.id === buyerId) ?? null;
    dispatch({ type: "APPLY_BUYER", buyer });
  }

  function applyLocation(locationId: string) {
    const location = locations.find((entry) => entry.id === locationId) ?? null;
    dispatch({ type: "APPLY_LOCATION", location });
  }

  return (
    <div className="form-grid">
      <div className="field field-half">
        <label>Retailer</label>
        <select value={state.header.retailer_id} onChange={(event) => applyRetailer(event.target.value)}>
          <option value="">Select retailer...</option>
          {retailers.map((retailer) => (
            <option key={retailer.id} value={retailer.id}>
              {retailer.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-half">
        <label>Buyer / Contact</label>
        <select value={state.header.buyer_id} onChange={(event) => applyBuyer(event.target.value)}>
          <option value="">Select buyer...</option>
          {buyersForRetailer.map((buyer) => (
            <option key={buyer.id} value={buyer.id}>
              {buyer.buyer_name} | {buyer.company_name}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-half">
        <label>Ship To Location</label>
        <select value={state.header.location_id} onChange={(event) => applyLocation(event.target.value)}>
          <option value="">Select location...</option>
          {locationsForRetailer.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-half">
        <label>Vendor / Manufacturer (optional)</label>
        <select
          value={state.header.vendor_id}
          onChange={(event) =>
            dispatch({ type: "SET_HEADER_FIELD", field: "vendor_id", value: event.target.value })
          }
        >
          <option value="">No vendor selected</option>
          {vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
