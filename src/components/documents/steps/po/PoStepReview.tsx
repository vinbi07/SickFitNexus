import { PurchaseOrderDocumentView } from "@/components/PurchaseOrderDocumentView";
import type { PoLineItem, PurchaseOrder } from "@/types/domain";
import type { PoWizardAction, PoWizardState } from "@/state/purchaseOrderWizardReducer";
import { normalizePoWizardLineItems } from "@/state/purchaseOrderWizardReducer";

export function getPoStepReviewIssues(state: PoWizardState): string[] {
  const issues: string[] = [];
  if (!state.header.po_number.trim()) issues.push("PO number is required.");
  if (!state.header.bill_to_company_name.trim()) issues.push("Bill To company name is required.");
  if (!state.header.ship_to_company_name.trim()) issues.push("Ship To company name is required.");
  const namedLines = state.lineItems.filter((item) => String(item.product_name ?? "").trim());
  if (!namedLines.length) issues.push("Add at least one product line before creating this PO.");
  namedLines.forEach((item, index) => {
    if (Number(item.quantity_ordered ?? 0) <= 0) {
      issues.push(`Line ${index + 1} needs a quantity greater than zero.`);
    }
  });
  return issues;
}

function buildPreviewPurchaseOrder(state: PoWizardState): PurchaseOrder {
  const lines = normalizePoWizardLineItems(state.lineItems);
  const totalCost = lines.reduce((sum, item) => sum + Number(item.extended_cost ?? 0), 0);
  const totalRetail = lines.reduce((sum, item) => sum + Number(item.extended_retail ?? 0), 0);
  const totalUnits = lines.reduce((sum, item) => sum + Number(item.quantity_ordered ?? 0), 0);
  const h = state.header;
  return {
    id: h.id ?? "preview",
    po_number: h.po_number,
    vendor_id: h.vendor_id || null,
    retailer_id: h.retailer_id || null,
    buyer_id: h.buyer_id || null,
    location_id: h.location_id || null,
    status: "Draft",
    po_type: "Retailer PO",
    approval_status: "Not Requested",
    allocation_status: "Not Allocated",
    order_date: h.order_date || null,
    ship_date: null,
    submitted_at: h.order_date || null,
    eta_date: null,
    expected_delivery_date: null,
    actual_delivery_date: null,
    invoice_status: "Open",
    invoice_paid_at: null,
    tracking_number: null,
    shipment_status: null,
    tracking_status: null,
    generated_form_url: null,
    source_channel: "Document Wizard",
    currency_code: h.currency_code,
    bill_to_company_name: h.bill_to_company_name || null,
    bill_to_contact_name: h.bill_to_contact_name || null,
    bill_to_street: h.bill_to_street || null,
    bill_to_city: h.bill_to_city || null,
    bill_to_state: h.bill_to_state || null,
    bill_to_zip: h.bill_to_zip || null,
    bill_to_phone: h.bill_to_phone || null,
    bill_to_email: h.bill_to_email || null,
    ship_to_company_name: h.ship_to_company_name || null,
    ship_to_attention: h.ship_to_attention || null,
    ship_to_street: h.ship_to_street || null,
    ship_to_city: h.ship_to_city || null,
    ship_to_state: h.ship_to_state || null,
    ship_to_zip: h.ship_to_zip || null,
    ship_to_phone: h.ship_to_phone || null,
    payment_terms_snapshot: h.payment_terms_snapshot || null,
    buyer_name_snapshot: h.buyer_name_snapshot || null,
    approver_name_snapshot: h.approver_name_snapshot || null,
    compliance_snapshot: {},
    buyer_notes: null,
    internal_notes: null,
    hold_reason: null,
    counter_status: "None",
    start_ship_date: h.start_ship_date || null,
    ship_complete_date: h.ship_complete_date || null,
    subtotal: totalCost,
    total_units: totalUnits,
    total_retail: totalRetail,
    requested_action: "draft",
    approved_at: null,
    approved_by: null,
    queued_for_fulfillment_at: null,
    cancelled_at: null,
    total_cost: totalCost,
    source_file_name: null,
    notes: h.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function PoStepReview({
  state,
  dispatch,
  onGoToStep,
}: {
  state: PoWizardState;
  dispatch: (action: PoWizardAction) => void;
  onGoToStep: (index: number) => void;
}) {
  const issues = getPoStepReviewIssues(state);
  const previewPo = buildPreviewPurchaseOrder(state);
  const previewLines = normalizePoWizardLineItems(state.lineItems);

  return (
    <div className="section-stack">
      {issues.length ? (
        <div className="panel">
          <div className="panel-header">
            <h3>Before You Create This Purchase Order</h3>
          </div>
          <ul className="error-detail-list">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onGoToStep(0)}>
              Edit Retailer &amp; Vendor
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onGoToStep(2)}>
              Edit Addresses
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => onGoToStep(3)}>
              Edit Products
            </button>
          </div>
        </div>
      ) : null}

      <div className="field field-wide">
        <label>Notes</label>
        <textarea
          rows={3}
          value={state.header.notes}
          onChange={(event) => dispatch({ type: "SET_HEADER_FIELD", field: "notes", value: event.target.value })}
        />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="lookbook-kicker">Live Preview</p>
            <h3>SickFit Purchase Order</h3>
          </div>
        </div>
        <PurchaseOrderDocumentView purchaseOrder={previewPo} lineItems={previewLines as PoLineItem[]} />
      </div>
    </div>
  );
}
