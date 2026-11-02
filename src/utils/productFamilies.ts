import type { Product } from "@/types/domain";
import { getProductFamilyName } from "@/utils/lookbook";
import { getMarginMetrics } from "@/utils/operations";

/** Worst-first stock states, as the list shows them. */
export type FamilyStockState = "Out of stock" | "Danger" | "Low" | "Slow Mover" | "Healthy";

const STATE_RANK: Record<FamilyStockState, number> = {
  "Out of stock": 0,
  Danger: 1,
  Low: 2,
  "Slow Mover": 3,
  Healthy: 4,
};

export interface ProductFamily {
  key: string;
  /** Row used for the family's name, image, vendor and category. */
  root: Product;
  name: string;
  /** Sellable SKUs in the family, in variant order. */
  variants: Product[];
  totalStock: number;
  minPrice: number;
  maxPrice: number;
  /** Average margin % across priced variants, or null when nothing is priced. */
  marginPercent: number | null;
  stockState: FamilyStockState;
  outOfStockCount: number;
  barcodeProblemCount: number;
}

export interface FamilyInputs {
  /** Stock health per SKU, e.g. from getInventoryHealthLabel. */
  healthOf: (product: Product) => string;
  /** True when a SKU's barcode needs fixing. */
  hasBarcodeProblem: (product: Product) => boolean;
}

function variantOrder(left: Product, right: Product) {
  return (left.variant_sort_order ?? 0) - (right.variant_sort_order ?? 0) || left.name.localeCompare(right.name);
}

/**
 * Groups SKUs into products the way Shopify lists them: children under their
 * parent style, and synced variants that share a Shopify product together.
 * A parent that only exists to hold variants (no stock of its own) is not
 * counted as a variant.
 */
export function groupProductFamilies(products: Product[], inputs: FamilyInputs): ProductFamily[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const groups = new Map<string, Product[]>();
  const keyOfShopifyProduct = new Map<string, string>();

  for (const product of products) {
    const parent = product.parent_product_id ? byId.get(product.parent_product_id) : null;
    const root = parent ?? product;
    let key = root.id;
    const shopifyId = root.shopify_product_id;
    if (shopifyId) {
      const existing = keyOfShopifyProduct.get(shopifyId);
      if (existing) key = existing;
      else keyOfShopifyProduct.set(shopifyId, key);
    }
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }

  return [...groups.entries()].map(([key, members]) => {
    const container = byId.get(key) && members.some((member) => member.parent_product_id === key) ? byId.get(key)! : null;
    const variants = members
      .filter((member) => member !== container || Number(member.current_inventory ?? 0) > 0)
      .sort(variantOrder);
    const sellable = variants.length ? variants : members;
    const root = container ?? sellable[0];

    const totalStock = sellable.reduce((sum, variant) => sum + Number(variant.current_inventory ?? 0), 0);
    const prices = sellable.map((variant) => Number(variant.unit_price ?? 0)).filter((price) => price > 0);
    const margins = sellable
      .filter((variant) => Number(variant.unit_price ?? 0) > 0)
      .map((variant) => getMarginMetrics(variant.unit_cost, variant.unit_price).marginPercent);
    const outOfStockCount = sellable.filter((variant) => Number(variant.current_inventory ?? 0) <= 0).length;

    let stockState: FamilyStockState = totalStock <= 0 ? "Out of stock" : "Healthy";
    if (stockState !== "Out of stock") {
      for (const variant of sellable) {
        const health = inputs.healthOf(variant) as FamilyStockState;
        if (health in STATE_RANK && STATE_RANK[health] < STATE_RANK[stockState]) stockState = health;
      }
    }

    return {
      key,
      root,
      name: getProductFamilyName(root),
      variants: sellable,
      totalStock,
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
      marginPercent: margins.length ? Math.round(margins.reduce((sum, value) => sum + value, 0) / margins.length) : null,
      stockState,
      outOfStockCount,
      barcodeProblemCount: sellable.filter(inputs.hasBarcodeProblem).length,
    };
  });
}

/** Low or out of stock: the "Low stock" tab. */
export function isLowStockFamily(family: ProductFamily) {
  return family.stockState === "Out of stock" || family.stockState === "Danger" || family.stockState === "Low";
}

/** Anything worth a look today: stock trouble or a barcode to fix. */
export function needsAttention(family: ProductFamily) {
  return isLowStockFamily(family) || family.outOfStockCount > 0 || family.barcodeProblemCount > 0;
}
