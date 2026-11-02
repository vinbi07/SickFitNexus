import { describe, expect, it } from "vitest";
import type { Product } from "@/types/domain";
import { groupProductFamilies, isLowStockFamily, needsAttention } from "@/utils/productFamilies";

let seq = 0;
const product = (overrides: Partial<Product>): Product =>
  ({
    id: `p${++seq}`,
    parent_product_id: null,
    sku: `SKU-${seq}`,
    name: `Product ${seq}`,
    variant_title: null,
    variant_sort_order: 0,
    unit_cost: 2,
    unit_price: 10,
    current_inventory: 10,
    shopify_product_id: null,
    upc: null,
    ...overrides,
  }) as Product;

const healthy = { healthOf: () => "Healthy", hasBarcodeProblem: () => false };

describe("groupProductFamilies", () => {
  it("nests children under their parent and skips an empty parent container", () => {
    const parent = product({ id: "parent", name: "Texas Crew", current_inventory: 0 });
    const small = product({ parent_product_id: "parent", variant_title: "S", variant_sort_order: 1, current_inventory: 60 });
    const medium = product({ parent_product_id: "parent", variant_title: "M", variant_sort_order: 2, current_inventory: 40, unit_price: 14 });
    const [family] = groupProductFamilies([parent, medium, small], healthy);
    expect(family.name).toBe("Texas Crew");
    expect(family.variants.map((v) => v.variant_title)).toEqual(["S", "M"]);
    expect(family.totalStock).toBe(100);
    expect([family.minPrice, family.maxPrice]).toEqual([10, 14]);
  });

  it("merges synced variants that share a Shopify product", () => {
    const families = groupProductFamilies(
      [
        product({ shopify_product_id: "gid-1", name: "Ankle 3-pack" }),
        product({ shopify_product_id: "gid-1", name: "Ankle 3-pack" }),
        product({ shopify_product_id: "gid-2" }),
      ],
      healthy,
    );
    expect(families.map((family) => family.variants.length)).toEqual([2, 1]);
  });

  it("averages margin over priced variants only", () => {
    const [family] = groupProductFamilies(
      [
        product({ id: "a", unit_cost: 2, unit_price: 10 }),
        product({ parent_product_id: "a", unit_cost: 6, unit_price: 10 }),
        product({ parent_product_id: "a", unit_cost: 1, unit_price: 0 }),
      ],
      healthy,
    );
    expect(family.marginPercent).toBe(60);
  });

  it("rolls stock state up to the worst variant", () => {
    const low = product({ id: "low-root" });
    const lowChild = product({ parent_product_id: "low-root" });
    const [family] = groupProductFamilies([low, lowChild], {
      healthOf: (p) => (p.id === lowChild.id ? "Low" : "Healthy"),
      hasBarcodeProblem: () => false,
    });
    expect(family.stockState).toBe("Low");
    expect(isLowStockFamily(family)).toBe(true);
  });

  it("reports out of stock and barcode problems for the attention tab", () => {
    const [empty] = groupProductFamilies([product({ current_inventory: 0 })], healthy);
    expect(empty.stockState).toBe("Out of stock");

    const root = product({ id: "bc" });
    const [withBarcodeIssue] = groupProductFamilies([root, product({ parent_product_id: "bc" })], {
      healthOf: () => "Healthy",
      hasBarcodeProblem: (p) => p.id === root.id,
    });
    expect(withBarcodeIssue.barcodeProblemCount).toBe(1);
    expect(isLowStockFamily(withBarcodeIssue)).toBe(false);
    expect(needsAttention(withBarcodeIssue)).toBe(true);
  });
});
