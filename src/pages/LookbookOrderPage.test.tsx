import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LookbookOrderPage } from "@/pages/LookbookOrderPage";
import { lookbookOrderService } from "@/services/lookbookOrderService";
import type { Buyer, Product, PurchaseOrder, Retailer } from "@/types/domain";

vi.mock("@/services/lookbookOrderService", () => ({
  lookbookOrderService: {
    loadByToken: vi.fn(),
    save: vi.fn(),
  },
}));

const buyer: Buyer = {
  id: "buyer-1",
  retailer_id: "retailer-1",
  lookbook_template_id: null,
  lookbook_status: "draft",
  company_name: "Retailer Co",
  buyer_name: "Alex Buyer",
  buyer_email: "alex@example.com",
  phone: null,
  billing_address: "1 Billing St",
  shipping_address: "1 Shipping St",
  payment_terms: "Net 30",
  order_mode_enabled: true,
  compliance_requirements: null,
  assigned_sales_rep: null,
  access_token: "token-1",
  link_validity_days: 30,
  token_expires_at: null,
  last_accessed_at: null,
  created_at: "",
  updated_at: "",
  retailers: null,
};

const retailer: Retailer = {
  id: "retailer-1",
  name: "Retailer Co",
  status: "Active",
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
  lookbook_intro: null,
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

const product: Product = {
  id: "product-1",
  parent_product_id: null,
  sku: "SKU-1",
  upc: "123456789012",
  name: "SickFit Tee",
  variant_title: null,
  variant_sort_order: 0,
  category: null,
  description: "Premium tee",
  vendor_id: null,
  unit_cost: 10,
  unit_price: 30,
  pack_size: "6 units",
  case_pack_quantity: 6,
  wholesale_price: 18,
  msrp: 30,
  weight: "2 lb",
  dimensions: "12x10x6",
  current_inventory: 60,
  inventory_available: 60,
  inventory_allocated: 0,
  safety_stock: 5,
  image_url: null,
  compliance_docs_required: [],
  compliance_docs_status: "Ready",
  no_bundles: false,
  ignored: false,
  shopify_product_id: null,
  shopify_variant_id: null,
  shopify_handle: null,
  shopify_admin_url: null,
  shopify_storefront_url: null,
  is_shopify_synced: false,
  last_shopify_sync_at: null,
  created_at: "",
  updated_at: "",
  vendors: null,
  parent_products: null,
  variants: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/lookbook/token-1"]}>
      <Routes>
        <Route path="/lookbook/:token" element={<LookbookOrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LookbookOrderPage", () => {
  beforeEach(() => {
    vi.mocked(lookbookOrderService.loadByToken).mockResolvedValue({
      buyer,
      retailer,
      products: [product],
      existingDraft: null,
      existingDraftLineItems: [],
      counterEvents: [],
      expired: false,
    });
    vi.mocked(lookbookOrderService.save).mockResolvedValue({
      id: "po-1",
      po_number: "SF-20260518-001",
    } as PurchaseOrder);
  });

  it("renders buyer ordering controls", async () => {
    renderPage();
    expect(await screen.findByText(/SickFit Wholesale Lookbook/i)).toBeInTheDocument();
    expect(screen.getByText(/Save Draft/i)).toBeInTheDocument();
    expect(screen.getByText(/Submit PO to SickFit/i)).toBeInTheDocument();
  });

  it("shows an empty selected-items state before quantities are added", async () => {
    renderPage();
    expect(await screen.findByText(/No selected items yet/i)).toBeInTheDocument();
  });

  it("shows thank-you state after submit", async () => {
    renderPage();
    await screen.findByText(/SickFit Wholesale Lookbook/i);
    fireEvent.click(screen.getAllByText("+")[0]);
    fireEvent.click(screen.getByText(/Submit PO to SickFit/i));
    await waitFor(() => expect(screen.getByText(/Order submitted/i)).toBeInTheDocument());
  });

  it("shows empty product state when no products are available", async () => {
    vi.mocked(lookbookOrderService.loadByToken).mockResolvedValueOnce({
      buyer,
      retailer,
      products: [],
      existingDraft: null,
      existingDraftLineItems: [],
      counterEvents: [],
      expired: false,
    });
    renderPage();
    expect(await screen.findByText(/No products are available/i)).toBeInTheDocument();
  });

  it("shows an inline warning and blocks quantities above the available case limit", async () => {
    vi.mocked(lookbookOrderService.loadByToken).mockResolvedValueOnce({
      buyer,
      retailer,
      products: [
        {
          ...product,
          current_inventory: 4,
          inventory_available: 4,
          inventory_allocated: 0,
        },
      ],
      existingDraft: null,
      existingDraftLineItems: [],
      counterEvents: [],
      expired: false,
    });

    renderPage();
    await screen.findByText(/SickFit Wholesale Lookbook/i);

    const incrementButton = screen.getAllByText("+")[0];
    fireEvent.click(incrementButton);
    fireEvent.click(incrementButton);
    fireEvent.click(incrementButton);

    expect(screen.getByText(/Only 2 cases available right now\./i)).toBeInTheDocument();
    expect(screen.getByText(/4 packs \| \$72/i)).toBeInTheDocument();
  });
});
