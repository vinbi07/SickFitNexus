import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { LookbookExperience } from "@/components/LookbookExperience";
import { useAsyncData } from "@/hooks/useAsyncData";
import { lookbookOrderService } from "@/services/lookbookOrderService";
import type { Buyer, Product, Retailer } from "@/types/domain";

type EphemeralPreviewState = {
  products: Product[];
  title?: string;
  description?: string;
};

function buildPlaceholderRetailer(state: EphemeralPreviewState): Retailer {
  return {
    id: "preview-retailer",
    name: state.title ?? "Preview Account",
    status: "Prospect",
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    secondary_contacts: null,
    account_number: null,
    supplier_id: null,
    activation_id: null,
    shipping_requirements: null,
    billing_company_name: null,
    billing_contact_name: null,
    billing_street: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
    billing_phone: null,
    billing_email: null,
    shipping_company_name: null,
    shipping_attention: null,
    shipping_street: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip: null,
    shipping_phone: null,
    sop_notes: null,
    parent_retailer_id: null,
    retailer_group: null,
    logo_url: null,
    brand_accent_color: null,
    lookbook_intro: state.description ?? null,
    default_payment_terms: null,
    order_mode_policy: "enabled",
    edi_required: false,
    ordering_cadence_days: null,
    next_reorder_start: null,
    next_reorder_end: null,
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

function buildPlaceholderBuyer(): Buyer {
  return {
    id: "preview-buyer",
    retailer_id: "preview-retailer",
    lookbook_template_id: null,
    lookbook_status: "draft",
    company_name: "Preview Account",
    buyer_name: "Sample Buyer",
    buyer_email: "",
    phone: null,
    billing_address: null,
    shipping_address: null,
    payment_terms: null,
    order_mode_enabled: true,
    compliance_requirements: null,
    assigned_sales_rep: null,
    access_token: "",
    link_validity_days: null,
    token_expires_at: null,
    last_accessed_at: null,
    created_at: "",
    updated_at: "",
    retailers: null,
    lookbook_templates: null,
  };
}

export function LookbookPreviewPage() {
  const params = useParams();
  const buyerId = params.buyerId ?? "";
  const location = useLocation();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [quantityWarnings, setQuantityWarnings] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const ephemeralState = buyerId ? null : (location.state as EphemeralPreviewState | null);

  const { data, loading, error } = useAsyncData(
    async () => {
      if (buyerId) return lookbookOrderService.loadPreviewByBuyerId(buyerId);
      return {
        buyer: buildPlaceholderBuyer(),
        retailer: buildPlaceholderRetailer(ephemeralState ?? { products: [] }),
        products: ephemeralState?.products ?? [],
        existingDraft: null,
        existingDraftLineItems: [],
        counterEvents: [],
        expired: false,
      };
    },
    [buyerId],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load this preview"} />;
  if (!buyerId && !ephemeralState) {
    return <ErrorState message="No lookbook data was passed to preview. Go back and try again." />;
  }

  return (
    <LookbookExperience
      mode="preview"
      retailer={data.retailer}
      buyer={data.buyer}
      products={data.products}
      existingDraft={data.existingDraft}
      counterEvents={data.counterEvents}
      quantities={quantities}
      setQuantities={setQuantities}
      quantityWarnings={quantityWarnings}
      setQuantityWarnings={setQuantityWarnings}
      notes={notes}
      onNotesChange={setNotes}
      onClosePreview={() => navigate(-1)}
      profile={{
        company_name: data.buyer.company_name,
        buyer_name: data.buyer.buyer_name,
        buyer_email: data.buyer.buyer_email,
        phone: data.buyer.phone,
        shipping_address: data.buyer.shipping_address,
        billing_address: data.buyer.billing_address,
      }}
    />
  );
}
