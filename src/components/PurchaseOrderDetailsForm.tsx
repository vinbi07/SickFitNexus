import type { Buyer, Location, PurchaseOrder, PurchaseOrderStatus, PurchaseOrderType, Retailer, Vendor } from "@/types/domain";
import { StatusBadge } from "@/components/StatusBadge";
import { getPaymentStatusLabel } from "@/utils/operations";

export const EDITABLE_PO_STATUSES: PurchaseOrderStatus[] = ["Draft", "Pending", "On Hold", "Delayed", "Issue Flagged"];
export const PO_TYPES: PurchaseOrderType[] = ["Manufacturer PO", "Retailer PO", "Work Order", "Customer Reorder"];
export const PAYMENT_TERMS_OPTIONS = ["Net 15", "Net 30", "Net 45", "Net 60"];

export interface PurchaseOrderDrawerFormState {
  po_type: PurchaseOrderType;
  status: PurchaseOrderStatus;
  vendor_id: string;
  retailer_id: string;
  buyer_id: string;
  location_id: string;
  order_date: string;
  start_ship_date: string;
  ship_complete_date: string;
  expected_delivery_date: string;
  ship_date: string;
  eta_date: string;
  ship_to_company_name: string;
  ship_to_attention: string;
  ship_to_street: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_zip: string;
  ship_to_phone: string;
  tracking_number: string;
  bill_to_company_name: string;
  bill_to_contact_name: string;
  bill_to_street: string;
  bill_to_city: string;
  bill_to_state: string;
  bill_to_zip: string;
  bill_to_phone: string;
  bill_to_email: string;
  payment_terms_snapshot: string;
  currency_code: string;
  notes: string;
  internal_notes: string;
}

export function buildFormStateFromPurchaseOrder(po: PurchaseOrder): PurchaseOrderDrawerFormState {
  return {
    po_type: po.po_type,
    status: po.status,
    vendor_id: po.vendor_id ?? "",
    retailer_id: po.retailer_id ?? "",
    buyer_id: po.buyer_id ?? "",
    location_id: po.location_id ?? "",
    order_date: po.order_date ?? "",
    start_ship_date: po.start_ship_date ?? "",
    ship_complete_date: po.ship_complete_date ?? "",
    expected_delivery_date: po.expected_delivery_date ?? "",
    ship_date: po.ship_date ?? "",
    eta_date: po.eta_date ?? "",
    ship_to_company_name: po.ship_to_company_name ?? "",
    ship_to_attention: po.ship_to_attention ?? "",
    ship_to_street: po.ship_to_street ?? "",
    ship_to_city: po.ship_to_city ?? "",
    ship_to_state: po.ship_to_state ?? "",
    ship_to_zip: po.ship_to_zip ?? "",
    ship_to_phone: po.ship_to_phone ?? "",
    tracking_number: po.tracking_number ?? "",
    bill_to_company_name: po.bill_to_company_name ?? "",
    bill_to_contact_name: po.bill_to_contact_name ?? "",
    bill_to_street: po.bill_to_street ?? "",
    bill_to_city: po.bill_to_city ?? "",
    bill_to_state: po.bill_to_state ?? "",
    bill_to_zip: po.bill_to_zip ?? "",
    bill_to_phone: po.bill_to_phone ?? "",
    bill_to_email: po.bill_to_email ?? "",
    payment_terms_snapshot: po.payment_terms_snapshot ?? "",
    currency_code: po.currency_code ?? "",
    notes: po.notes ?? "",
    internal_notes: po.internal_notes ?? "",
  };
}

function emptyToNull(value: string) {
  return value === "" ? null : value;
}

export function buildGeneralInfoPatch(formState: PurchaseOrderDrawerFormState): Partial<PurchaseOrder> {
  return {
    po_type: formState.po_type,
    status: formState.status,
    vendor_id: emptyToNull(formState.vendor_id),
    retailer_id: emptyToNull(formState.retailer_id),
    buyer_id: emptyToNull(formState.buyer_id),
    location_id: emptyToNull(formState.location_id),
    order_date: emptyToNull(formState.order_date),
    start_ship_date: emptyToNull(formState.start_ship_date),
    ship_complete_date: emptyToNull(formState.ship_complete_date),
    expected_delivery_date: emptyToNull(formState.expected_delivery_date),
    ship_date: emptyToNull(formState.ship_date),
    eta_date: emptyToNull(formState.eta_date),
    ship_to_company_name: emptyToNull(formState.ship_to_company_name),
    ship_to_attention: emptyToNull(formState.ship_to_attention),
    ship_to_street: emptyToNull(formState.ship_to_street),
    ship_to_city: emptyToNull(formState.ship_to_city),
    ship_to_state: emptyToNull(formState.ship_to_state),
    ship_to_zip: emptyToNull(formState.ship_to_zip),
    ship_to_phone: emptyToNull(formState.ship_to_phone),
    tracking_number: emptyToNull(formState.tracking_number),
    bill_to_company_name: emptyToNull(formState.bill_to_company_name),
    bill_to_contact_name: emptyToNull(formState.bill_to_contact_name),
    bill_to_street: emptyToNull(formState.bill_to_street),
    bill_to_city: emptyToNull(formState.bill_to_city),
    bill_to_state: emptyToNull(formState.bill_to_state),
    bill_to_zip: emptyToNull(formState.bill_to_zip),
    bill_to_phone: emptyToNull(formState.bill_to_phone),
    bill_to_email: emptyToNull(formState.bill_to_email),
    payment_terms_snapshot: emptyToNull(formState.payment_terms_snapshot),
    currency_code: emptyToNull(formState.currency_code),
    notes: emptyToNull(formState.notes),
    internal_notes: emptyToNull(formState.internal_notes),
  };
}

export function PurchaseOrderDetailsForm({
  purchaseOrder,
  formState,
  onChange,
  readOnly,
  vendors,
  retailers,
  buyers,
  locations,
  onMarkAsPaid,
  markingAsPaid,
}: {
  purchaseOrder: PurchaseOrder;
  formState: PurchaseOrderDrawerFormState;
  onChange: <K extends keyof PurchaseOrderDrawerFormState>(key: K, value: PurchaseOrderDrawerFormState[K]) => void;
  readOnly: boolean;
  vendors: Vendor[];
  retailers: Retailer[];
  buyers: Buyer[];
  locations: Location[];
  onMarkAsPaid?: () => void;
  markingAsPaid?: boolean;
}) {
  const isManufacturerPo = formState.po_type === "Manufacturer PO";
  const statusIsEditable = EDITABLE_PO_STATUSES.includes(purchaseOrder.status);
  const paymentStatus = getPaymentStatusLabel(purchaseOrder);

  function field(key: keyof PurchaseOrderDrawerFormState) {
    return `po-drawer-field-${key}`;
  }

  function textField(key: keyof PurchaseOrderDrawerFormState, label: string, type: "text" | "date" | "email" = "text", wide = false) {
    return (
      <div className={wide ? "field field-wide" : "field field-half"}>
        <label htmlFor={field(key)}>{label}</label>
        <input
          id={field(key)}
          type={type}
          value={formState[key]}
          disabled={readOnly}
          onChange={(event) => onChange(key, event.target.value as PurchaseOrderDrawerFormState[typeof key])}
        />
      </div>
    );
  }

  return (
    <>
      <fieldset className="po-drawer-section">
        <legend>Basic Information</legend>
        <div className="form-grid">
          <div className="field field-half">
            <label htmlFor="po-drawer-field-po_number">PO Number</label>
            <input id="po-drawer-field-po_number" type="text" value={purchaseOrder.po_number} disabled readOnly />
          </div>
          <div className="field field-half">
            <label htmlFor={field("po_type")}>PO Type</label>
            <select
              id={field("po_type")}
              value={formState.po_type}
              disabled={readOnly}
              onChange={(event) => onChange("po_type", event.target.value as PurchaseOrderType)}
            >
              {PO_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="field field-half">
            <label htmlFor={field("status")}>Status</label>
            {statusIsEditable ? (
              <select
                id={field("status")}
                value={formState.status}
                disabled={readOnly}
                onChange={(event) => onChange("status", event.target.value as PurchaseOrderStatus)}
              >
                {EDITABLE_PO_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            ) : (
              <div className="cell-stack">
                <StatusBadge label={purchaseOrder.status} />
                <span className="helper-text">Use Approve/Fulfill/Reject on the full purchase order for this status.</span>
              </div>
            )}
          </div>
          <div className="field field-half">
            <label htmlFor={field("vendor_id")}>{isManufacturerPo ? "Manufacturer" : "Vendor"}</label>
            <select
              id={field("vendor_id")}
              value={formState.vendor_id}
              disabled={readOnly}
              onChange={(event) => onChange("vendor_id", event.target.value)}
            >
              <option value="">Unassigned</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
          </div>
          {!isManufacturerPo ? (
            <div className="field field-half">
              <label htmlFor={field("retailer_id")}>Retailer</label>
              <select
                id={field("retailer_id")}
                value={formState.retailer_id}
                disabled={readOnly}
                onChange={(event) => onChange("retailer_id", event.target.value)}
              >
                <option value="">Unassigned</option>
                {retailers.map((retailer) => (
                  <option key={retailer.id} value={retailer.id}>{retailer.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="field field-half">
            <label htmlFor={field("buyer_id")}>Assigned Owner</label>
            <select
              id={field("buyer_id")}
              value={formState.buyer_id}
              disabled={readOnly}
              onChange={(event) => onChange("buyer_id", event.target.value)}
            >
              <option value="">Unassigned</option>
              {buyers.map((buyer) => (
                <option key={buyer.id} value={buyer.id}>{buyer.buyer_name}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="po-drawer-section">
        <legend>Dates and Deadlines</legend>
        <div className="form-grid">
          {textField("order_date", "Order Date", "date")}
          {textField("start_ship_date", "Start Ship Date", "date")}
          {textField("ship_complete_date", "Ship Complete Date", "date")}
          {textField("expected_delivery_date", "Expected Delivery Date", "date")}
          {textField("ship_date", "Ship Date", "date")}
          {textField("eta_date", "Estimated Arrival (ETA)", "date")}
        </div>
      </fieldset>

      <fieldset className="po-drawer-section">
        <legend>Shipping and Delivery</legend>
        <div className="form-grid">
          {textField("ship_to_company_name", "Ship-To Company")}
          {textField("ship_to_attention", "Attention")}
          {textField("ship_to_street", "Street", "text", true)}
          {textField("ship_to_city", "City")}
          {textField("ship_to_state", "State")}
          {textField("ship_to_zip", "ZIP")}
          {textField("ship_to_phone", "Phone")}
          <div className="field field-half">
            <label htmlFor={field("location_id")}>Delivery Location</label>
            <select
              id={field("location_id")}
              value={formState.location_id}
              disabled={readOnly}
              onChange={(event) => onChange("location_id", event.target.value)}
            >
              <option value="">Unassigned</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </div>
          {textField("tracking_number", "Tracking Number")}
        </div>
      </fieldset>

      <fieldset className="po-drawer-section">
        <legend>Payment Information</legend>
        <div className="form-grid">
          <div className="field field-half">
            <label>Payment Status</label>
            <div className="cell-stack">
              <StatusBadge label={paymentStatus} />
              {!readOnly && paymentStatus === "Unpaid" ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={markingAsPaid}
                  onClick={() => onMarkAsPaid?.()}
                >
                  {markingAsPaid ? "Marking..." : "Mark as Paid"}
                </button>
              ) : null}
            </div>
          </div>
          <div className="field field-half">
            <label htmlFor={field("payment_terms_snapshot")}>Payment Terms</label>
            <select
              id={field("payment_terms_snapshot")}
              value={formState.payment_terms_snapshot}
              disabled={readOnly}
              onChange={(event) => onChange("payment_terms_snapshot", event.target.value)}
            >
              <option value="">Not set</option>
              {PAYMENT_TERMS_OPTIONS.map((term) => (
                <option key={term} value={term}>{term}</option>
              ))}
            </select>
          </div>
          {textField("currency_code", "Currency")}
          {textField("bill_to_company_name", "Billing Company")}
          {textField("bill_to_contact_name", "Billing Contact")}
          {textField("bill_to_street", "Billing Street", "text", true)}
          {textField("bill_to_city", "Billing City")}
          {textField("bill_to_state", "Billing State")}
          {textField("bill_to_zip", "Billing ZIP")}
          {textField("bill_to_phone", "Billing Phone")}
          {textField("bill_to_email", "Billing Email", "email")}
        </div>
      </fieldset>

      <fieldset className="po-drawer-section">
        <legend>Notes</legend>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor={field("notes")}>Notes</label>
            <textarea
              id={field("notes")}
              rows={3}
              value={formState.notes}
              disabled={readOnly}
              onChange={(event) => onChange("notes", event.target.value)}
            />
          </div>
          <div className="field field-wide">
            <label htmlFor={field("internal_notes")}>Internal Notes</label>
            <textarea
              id={field("internal_notes")}
              rows={3}
              value={formState.internal_notes}
              disabled={readOnly}
              onChange={(event) => onChange("internal_notes", event.target.value)}
            />
          </div>
        </div>
      </fieldset>
    </>
  );
}
