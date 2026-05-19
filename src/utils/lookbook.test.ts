import { describe, expect, it } from "vitest";
import type { Buyer, Product } from "@/types/domain";
import {
  buildComplianceSnapshot,
  buildLineItemFromProduct,
  calculateLookbookTotals,
  deriveInventoryAvailable,
  getProductFamilyName,
  getProductVariantLabel,
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
  pack_size: "6 units",
  case_pack_quantity: 6,
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
    expect(line.unit_quantity).toBe(12);
    expect(line.extended_cost).toBe(216);
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
      totalUnits: 12,
      subtotal: 216,
      totalRetail: 360,
    });
  });

  it("validates inventory only when requested", () => {
    expect(() =>
      validateLookbookSelection([{ product_id: baseProduct.id, sku: baseProduct.sku, requested_case_quantity: 20 }], [baseProduct], {
        enforceInventory: false,
      }),
    ).not.toThrow();
    expect(() =>
      validateLookbookSelection([{ product_id: baseProduct.id, sku: baseProduct.sku, requested_case_quantity: 20 }], [baseProduct]),
    ).toThrow(/exceeds available inventory/i);
  });

  it("derives packs per case from pack title variants", () => {
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "1 Packs (Default)", case_pack_quantity: 99 })).toBe(12);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "3 Pack", case_pack_quantity: 99 })).toBe(4);
    expect(resolveCasePackQuantity({ name: "Sock Variant", pack_size: "6 Packs", case_pack_quantity: 99 })).toBe(2);
    expect(getUnitsPerPack({ name: "Sock Variant", pack_size: "6 Packs" })).toBe(6);
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
