import { describe, expect, it } from "vitest";
import type { Buyer, Product } from "@/types/domain";
import {
  buildComplianceSnapshot,
  buildLineItemFromProduct,
  calculateLookbookTotals,
  deriveInventoryAvailable,
  getProductFamilyName,
  getProductVariantLabel,
  getLookbookRetailPrice,
  getLookbookWholesalePrice,
  getUnitsPerPack,
  resolveCasePackQuantity,
  sortProductsByFamily,
  validateLookbookSelection,
} from "@/utils/lookbook";

const baseProduct: Product = {
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
  pack_size: "1 Pack",
  case_pack_quantity: 12,
  wholesale_price: 18,
  msrp: 30,
  weight: "2 lb",
  dimensions: "12x10x6",
  current_inventory: 60,
  inventory_available: 54,
  inventory_allocated: 6,
  safety_stock: 5,
  image_url: null,
  compliance_docs_required: ["W9"],
  compliance_docs_status: "Ready",
  no_bundles: false,
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

const buyer: Buyer = {
  id: "buyer-1",
  retailer_id: "retailer-1",
  lookbook_template_id: null,
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
  access_token: "token",
  link_validity_days: 30,
  token_expires_at: null,
  last_accessed_at: null,
  created_at: "",
  updated_at: "",
  retailers: null,
};

describe("lookbook utilities", () => {
  it("derives available inventory from on hand minus allocated", () => {
    expect(deriveInventoryAvailable(baseProduct)).toBe(54);
  });

  it("builds a case-pack line item and aggregates totals", () => {
    const line = buildLineItemFromProduct(baseProduct, 2);
    expect(line.unit_quantity).toBe(24);
    expect(line.extended_cost).toBe(432);
    expect(
      calculateLookbookTotals([
        {
          sku: String(line.sku),
          unit_quantity: Number(line.unit_quantity),
          extended_cost: Number(line.extended_cost),
          extended_retail: Number(line.extended_retail),
        },
      ]),
    ).toEqual({
      skuCount: 1,
      totalUnits: 24,
      subtotal: 432,
      totalRetail: 720,
    });
  });

  it("falls back to unit price when msrp is zero", () => {
    const line = buildLineItemFromProduct(
      {
        ...baseProduct,
        msrp: 0,
        unit_price: 42,
      },
      1,
    );

    expect(line.unit_retail).toBe(42);
    expect(line.extended_retail).toBe(504);
  });

  it("falls back to unit price times 0.665 when wholesale price is zero", () => {
    const line = buildLineItemFromProduct(
      {
        ...baseProduct,
        wholesale_price: 0,
        unit_price: 42,
      },
      1,
    );

    expect(line.unit_cost).toBe(27.93);
    expect(Number(line.extended_cost)).toBeCloseTo(335.16, 2);
  });

  it("returns the display retail price using unit price when msrp is zero", () => {
    expect(getLookbookRetailPrice({ msrp: 0, unit_price: 42 })).toBe(42);
    expect(getLookbookRetailPrice({ msrp: 55, unit_price: 42 })).toBe(55);
  });

  it("returns the display wholesale price using unit price times 0.665 when wholesale is zero", () => {
    expect(getLookbookWholesalePrice({ wholesale_price: 0, unit_price: 42 })).toBe(27.93);
    expect(getLookbookWholesalePrice({ wholesale_price: 18, unit_price: 42 })).toBe(18);
  });

  it("validates inventory only when requested", () => {
    expect(() =>
      validateLookbookSelection([{ product_id: baseProduct.id, sku: baseProduct.sku, requested_case_quantity: 20 }], [baseProduct], {
        enforceInventory: false,
      }),
    ).not.toThrow();
    expect(() =>
      validateLookbookSelection([{ product_id: baseProduct.id, sku: baseProduct.sku, requested_case_quantity: 5 }], [baseProduct]),
    ).toThrow(/exceeds available inventory/i);
  });

  it("allows ordering when upc is missing but sku is present", () => {
    expect(() =>
      validateLookbookSelection(
        [{ product_id: baseProduct.id, sku: baseProduct.sku, requested_case_quantity: 1 }],
        [{ ...baseProduct, upc: null }],
      ),
    ).not.toThrow();
  });

  it("derives packs per case from pack title variants", () => {
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "1 Packs (Default)", case_pack_quantity: 99 })).toBe(12);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "2 Pack", case_pack_quantity: 99 })).toBe(6);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "3 Pack", case_pack_quantity: 99 })).toBe(4);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "6 Packs", case_pack_quantity: 99 })).toBe(2);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "6 units", case_pack_quantity: 99 })).toBe(2);
    expect(getUnitsPerPack({ name: "Sock Variant", pack_size: "6 Packs" })).toBe(6);
  });

  it("prefers structured barcode pack quantity when product text is incomplete", () => {
    expect(
      resolveCasePackQuantity({
        name: "Sock Variant",
        pack_size: null,
        pack_quantity: null,
        pack_unit: null,
        case_pack_quantity: 99,
        product_barcode_links: [
          {
            id: "link-1",
            barcode_id: "barcode-1",
            product_id: "product-1",
            created_at: "",
            product_barcodes: {
              id: "barcode-1",
              sku: "SKU-1",
              handle: null,
              product_name: "Sock Variant",
              collection: null,
              pack_quantity: 1,
              pack_unit: "Pack",
              size: null,
              barcode_upc: null,
              created_at: "",
              updated_at: "",
              product_barcode_links: [],
            },
          },
        ],
      }),
    ).toBe(12);
  });

  it("creates a compliance snapshot summary", () => {
    const snapshot = buildComplianceSnapshot({
      buyer,
      retailerRequirementStatuses: [{ requirementName: "COI", status: "Compliant" }],
      productRequirements: [{ productId: baseProduct.id, sku: baseProduct.sku, requiredDocs: ["Lab Report"] }],
    });
    expect(snapshot.summary).toBe("1/2 docs on file");
    expect(snapshot.missingDocs).toContain("Lab Report");
  });

  it("groups display names by family and variant", () => {
    const childVariant: Product = {
      ...baseProduct,
      id: "product-2",
      parent_product_id: baseProduct.id,
      parent_products: baseProduct,
      name: "SickFit Tee 3 Pack",
      sku: "SKU-3PK",
      variant_title: "3 Pack",
      variant_sort_order: 2,
    };

    expect(getProductFamilyName(childVariant)).toBe("SickFit Tee");
    expect(getProductVariantLabel(childVariant)).toBe("3 Pack");
    expect(getProductVariantLabel(baseProduct)).toBe("Base style");
    expect(sortProductsByFamily([childVariant, baseProduct]).map((product) => product.sku)).toEqual(["SKU-1", "SKU-3PK"]);
  });
});
