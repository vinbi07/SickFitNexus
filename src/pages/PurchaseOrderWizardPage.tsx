import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoadingState } from "@/components/LoadingState";
import { InlineErrorLog } from "@/components/InlineErrorLog";
import { DocumentWizardShell } from "@/components/documents/wizard/DocumentWizardShell";
import { useDocumentWizard, type WizardStepDef } from "@/components/documents/wizard/useDocumentWizard";
import {
  PoStepRetailerVendor,
  isPoStepRetailerVendorValid,
} from "@/components/documents/steps/po/PoStepRetailerVendor";
import { PoStepOrderDetails, isPoStepOrderDetailsValid } from "@/components/documents/steps/po/PoStepOrderDetails";
import { PoStepAddresses, isPoStepAddressesValid } from "@/components/documents/steps/po/PoStepAddresses";
import { PoStepLineItems, isPoStepLineItemsValid } from "@/components/documents/steps/po/PoStepLineItems";
import { PoStepReview, getPoStepReviewIssues } from "@/components/documents/steps/po/PoStepReview";
import { useAsyncData } from "@/hooks/useAsyncData";
import { buyerService } from "@/services/buyerService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import {
  createInitialPoWizardState,
  normalizePoWizardLineItems,
  purchaseOrderWizardReducer,
  type PoWizardAction,
  type PoWizardState,
} from "@/state/purchaseOrderWizardReducer";
import { getUiErrorLog, type UiErrorLog } from "@/utils/errors";

const STEP_DEFS: WizardStepDef<PoWizardState>[] = [
  { id: "retailer", label: "Retailer & Vendor", isValid: isPoStepRetailerVendorValid },
  { id: "details", label: "Order Details", isValid: isPoStepOrderDetailsValid },
  { id: "addresses", label: "Addresses", isValid: isPoStepAddressesValid },
  { id: "products", label: "Products", isValid: isPoStepLineItemsValid },
  { id: "review", label: "Review", isValid: (state) => getPoStepReviewIssues(state).length === 0 },
];

export function PurchaseOrderWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const duplicateFromId = searchParams.get("copyFrom") ?? "";

  const { data, loading, error: loadError } = useAsyncData(async () => {
    const [retailers, buyers, locations, barcodes, vendors, poNumber] = await Promise.all([
      retailerService.list(),
      buyerService.list(),
      supportService.listLocations(),
      supportService.listBarcodes(),
      vendorService.list(),
      purchaseOrderService.generatePoNumber(),
    ]);
    return { retailers, buyers, locations, barcodes, vendors, poNumber };
  }, [duplicateFromId]);

  if (loading || !data) return <LoadingState />;
  if (loadError)
    return <InlineErrorLog error={getUiErrorLog(loadError, "We couldn't load the Purchase Order wizard")} />;

  return <PurchaseOrderWizardInner data={data} navigate={navigate} />;
}

function PurchaseOrderWizardInner({
  data,
  navigate,
}: {
  data: {
    retailers: Awaited<ReturnType<typeof retailerService.list>>;
    buyers: Awaited<ReturnType<typeof buyerService.list>>;
    locations: Awaited<ReturnType<typeof supportService.listLocations>>;
    barcodes: Awaited<ReturnType<typeof supportService.listBarcodes>>;
    vendors: Awaited<ReturnType<typeof vendorService.list>>;
    poNumber: string;
  };
  navigate: ReturnType<typeof useNavigate>;
}) {
  const storageKey = "sickfit-wizard:po:new";
  const wizard = useDocumentWizard<PoWizardState, PoWizardAction>({
    storageKey,
    reducer: purchaseOrderWizardReducer,
    createInitialState: () => createInitialPoWizardState(data.poNumber),
    steps: STEP_DEFS,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<UiErrorLog | null>(null);

  async function handleSubmit(nextStatus: "Draft" | "Pending") {
    const issues = getPoStepReviewIssues(wizard.state);
    if (issues.length) {
      setSubmitError(getUiErrorLog(new Error(issues[0]), "This Purchase Order isn't ready yet"));
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError(null);
      const validLineItems = normalizePoWizardLineItems(wizard.state.lineItems).filter((item) =>
        String(item.product_name ?? "").trim(),
      );
      const h = wizard.state.header;
      const savedPo = await purchaseOrderService.savePurchaseOrder({
        purchaseOrder: {
          po_number: h.po_number,
          vendor_id: h.vendor_id || null,
          retailer_id: h.retailer_id || null,
          buyer_id: h.buyer_id || null,
          location_id: h.location_id || null,
          po_type: "Retailer PO",
          status: nextStatus,
          order_date: h.order_date || null,
          start_ship_date: h.start_ship_date || null,
          ship_complete_date: h.ship_complete_date || null,
          currency_code: h.currency_code || "USD",
          bill_to_company_name: h.bill_to_company_name,
          bill_to_contact_name: h.bill_to_contact_name,
          bill_to_street: h.bill_to_street,
          bill_to_city: h.bill_to_city,
          bill_to_state: h.bill_to_state,
          bill_to_zip: h.bill_to_zip,
          bill_to_phone: h.bill_to_phone,
          bill_to_email: h.bill_to_email,
          ship_to_company_name: h.ship_to_company_name,
          ship_to_attention: h.ship_to_attention,
          ship_to_street: h.ship_to_street,
          ship_to_city: h.ship_to_city,
          ship_to_state: h.ship_to_state,
          ship_to_zip: h.ship_to_zip,
          ship_to_phone: h.ship_to_phone,
          payment_terms_snapshot: h.payment_terms_snapshot,
          buyer_name_snapshot: h.buyer_name_snapshot,
          approver_name_snapshot: h.approver_name_snapshot,
          notes: h.notes || null,
          buyers: data.buyers.find((buyer) => buyer.id === h.buyer_id) ?? null,
          retailers: data.retailers.find((retailer) => retailer.id === h.retailer_id) ?? null,
        },
        lineItems: validLineItems.map((item, index) => ({
          id: item.id,
          product_id: item.product_id || null,
          sku: String(item.sku ?? ""),
          upc: String(item.upc ?? ""),
          product_name: String(item.product_name ?? ""),
          description: String(item.description ?? item.product_name ?? ""),
          variant_label: String(item.variant_label ?? ""),
          unit: String(item.unit ?? "EA"),
          quantity_ordered: Number(item.quantity_ordered ?? 0),
          quantity_received: Number(item.quantity_received ?? 0),
          unit_cost: Number(item.unit_cost ?? 0),
          unit_retail: Number(item.unit_retail ?? 0),
          unit_quantity: Number(item.quantity_ordered ?? 0),
          case_pack_quantity: Number(item.case_pack_quantity ?? 1),
          case_quantity: Number(item.case_quantity ?? 1),
          extended_cost: Number(item.extended_cost ?? 0),
          extended_retail: Number(item.extended_retail ?? 0),
          sort_order: index,
        })),
      });
      wizard.markSubmitted();
      navigate(`/purchase-orders/${savedPo.id}`);
    } catch (err) {
      setSubmitError(getUiErrorLog(err, "We couldn't save this Purchase Order"));
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = wizard.currentStepIndex;

  return (
    <DocumentWizardShell
      title="New Purchase Order"
      description="Set up a retailer purchase order step by step."
      steps={STEP_DEFS}
      currentStepIndex={stepIndex}
      invalidStepIds={wizard.invalidStepIds}
      onSelectStep={wizard.goToStep}
      onBack={wizard.goBack}
      onNext={wizard.goNext}
      onSaveDraft={() => void handleSubmit("Draft")}
      onSubmit={() => void handleSubmit("Pending")}
      nextDisabled={!wizard.canGoNext}
      isLastStep={wizard.isLastStep}
      submitting={submitting}
      submitLabel="Create Purchase Order"
      error={submitError}
      draftRestored={wizard.draftRestored}
      onDiscardDraft={() =>
        wizard.discardDraft(() =>
          wizard.dispatch({ type: "RESET", state: createInitialPoWizardState(data.poNumber) }),
        )
      }
      cancelHref="/purchase-orders"
    >
      {STEP_DEFS[stepIndex].id === "retailer" ? (
        <PoStepRetailerVendor
          state={wizard.state}
          dispatch={wizard.dispatch}
          retailers={data.retailers}
          buyers={data.buyers}
          locations={data.locations}
          vendors={data.vendors}
        />
      ) : null}
      {STEP_DEFS[stepIndex].id === "details" ? (
        <PoStepOrderDetails state={wizard.state} dispatch={wizard.dispatch} />
      ) : null}
      {STEP_DEFS[stepIndex].id === "addresses" ? (
        <PoStepAddresses state={wizard.state} dispatch={wizard.dispatch} />
      ) : null}
      {STEP_DEFS[stepIndex].id === "products" ? (
        <PoStepLineItems state={wizard.state} dispatch={wizard.dispatch} barcodes={data.barcodes} />
      ) : null}
      {STEP_DEFS[stepIndex].id === "review" ? (
        <PoStepReview state={wizard.state} dispatch={wizard.dispatch} onGoToStep={wizard.goToStep} />
      ) : null}
    </DocumentWizardShell>
  );
}
