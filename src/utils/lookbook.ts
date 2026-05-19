import type { Buyer, ComplianceSnapshot, LookbookOrderInputLine, LookbookOrderTotals, PoLineItem, Product } from "@/types/domain";

export function deriveInventoryAvailable(product: Pick<Product, "current_inventory" | "inventory_allocated">) {
  return Math.max(Number(product.current_inventory ?? 0) - Number(product.inventory_allocated ?? 0), 0);
}

function getPackDescriptor(product: Pick<Product, "name" | "pack_size">) {
  return [product.pack_size ?? "", product.name ?? ""].join(" ").toLowerCase();
}

export function getUnitsPerPack(product: Pick<Product, "name" | "pack_size">) {
  const descriptor = getPackDescriptor(product);
  if (descriptor.includes("default")) return 1;

  const match = descriptor.match(/(\d+)\s*pack/);
  if (!match) return null;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveCasePackQuantity(product: Pick<Product, "name" | "pack_size" | "case_pack_quantity">) {
  const unitsPerPack = getUnitsPerPack(product);
  if (unitsPerPack && unitsPerPack > 0) {
    return Math.max(Math.floor(12 / unitsPerPack), 1);
  }

  return Math.max(Number(product.case_pack_quantity ?? 1), 1);
}

export function getOrderUnitLabel(product: Pick<Product, "name" | "pack_size">) {
  return (getUnitsPerPack(product) ?? 1) > 1 ? "packs" : "units";
}

export function getProductFamilyName(product: Pick<Product, "name"> & Partial<Pick<Product, "parent_products">>) {
  return product.parent_products?.name ?? product.name;
}

export function getProductVariantLabel(
  product: Pick<Product, "name" | "variant_title" | "parent_product_id">,
) {
  if (product.variant_title?.trim()) return product.variant_title.trim();
  if (product.parent_product_id) return product.name;
  return "Base style";
}

export function sortProductsByFamily(products: Product[]) {
  return [...products].sort((left, right) => {
    const familyComparison = getProductFamilyName(left).localeCompare(getProductFamilyName(right));
    if (familyComparison !== 0) return familyComparison;

    const variantComparison = Number(left.variant_sort_order ?? 0) - Number(right.variant_sort_order ?? 0);
    if (variantComparison !== 0) return variantComparison;

    const labelComparison = getProductVariantLabel(left).localeCompare(getProductVariantLabel(right));
    if (labelComparison !== 0) return labelComparison;

    return left.sku.localeCompare(right.sku);
  });
}

export function isCaseQuantityValid(product: Pick<Product, "case_pack_quantity">, caseQuantity: number) {
  return Number.isInteger(caseQuantity) && caseQuantity >= 0 && Number(product.case_pack_quantity ?? 1) > 0;
}

export function buildLineItemFromProduct(product: Product, caseQuantity: number): Partial<PoLineItem> {
  const safeCaseQuantity = Number(caseQuantity ?? 0);
  const unitQuantity = safeCaseQuantity * resolveCasePackQuantity(product);
  const unitCost = Number(product.wholesale_price ?? 0);
  const unitRetail = Number(product.msrp ?? product.unit_price ?? 0);
  const extendedCost = unitQuantity * unitCost;
  const extendedRetail = unitQuantity * unitRetail;

  return {
    product_id: product.id,
    sku: product.sku,
    upc: product.upc,
    product_name: product.name,
    description: product.description,
    unit: "EA",
    case_quantity: safeCaseQuantity,
    unit_quantity: unitQuantity,
    quantity_ordered: unitQuantity,
    quantity_received: 0,
    unit_cost: unitCost,
    unit_retail: unitRetail,
    line_total: extendedCost,
    extended_cost: extendedCost,
    extended_retail: extendedRetail,
  };
}

export function calculateLookbookTotals(lineItems: Array<Pick<PoLineItem, "sku" | "unit_quantity" | "extended_cost" | "extended_retail">>): LookbookOrderTotals {
  return lineItems.reduce<LookbookOrderTotals>(
    (accumulator, item) => ({
      skuCount: accumulator.skuCount + 1,
      totalUnits: accumulator.totalUnits + Number(item.unit_quantity ?? 0),
      subtotal: accumulator.subtotal + Number(item.extended_cost ?? 0),
      totalRetail: accumulator.totalRetail + Number(item.extended_retail ?? 0),
    }),
    { skuCount: 0, totalUnits: 0, subtotal: 0, totalRetail: 0 },
  );
}

export function buildComplianceSnapshot(params: {
  buyer: Buyer;
  retailerRequirementStatuses: Array<{ requirementName: string; status: string }>;
  productRequirements: Array<{ productId: string; sku: string; requiredDocs: string[] }>;
}): ComplianceSnapshot {
  const missingRetailerDocs = params.retailerRequirementStatuses
    .filter((entry) => entry.status !== "Compliant")
    .map((entry) => entry.requirementName);
  const productWarnings = params.productRequirements
    .filter((entry) => entry.requiredDocs.length > 0)
    .map((entry) => ({
      productId: entry.productId,
      sku: entry.sku,
      missingDocs: entry.requiredDocs,
    }));

  const missingDocs = [...missingRetailerDocs, ...productWarnings.flatMap((entry) => entry.missingDocs)];
  const requiredCount = params.retailerRequirementStatuses.length + params.productRequirements.reduce((sum, entry) => sum + entry.requiredDocs.length, 0);
  const compliantCount = Math.max(requiredCount - missingDocs.length, 0);

  return {
    retailerId: params.buyer.retailer_id,
    buyerId: params.buyer.id,
    summary: requiredCount === 0 ? "No compliance docs required" : `${compliantCount}/${requiredCount} docs on file`,
    compliantCount,
    requiredCount,
    missingDocs,
    productWarnings,
  };
}

export function validateLookbookSelection(lines: LookbookOrderInputLine[], products: Product[], options?: { enforceInventory?: boolean }) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  if (!lines.length) {
    throw new Error("Select at least one product before continuing.");
  }

  lines.forEach((line) => {
    const product = productsById.get(line.product_id);
    if (!product) throw new Error(`Product ${line.sku} is no longer available.`);
    if (!product.sku || !product.upc) throw new Error(`Product ${product.name} is missing a SKU or UPC.`);
    if (!isCaseQuantityValid(product, line.requested_case_quantity) || line.requested_case_quantity <= 0) {
      throw new Error(`Product ${product.name} must be ordered in whole case quantities.`);
    }
    const requestedUnits = Number(line.requested_case_quantity) * resolveCasePackQuantity(product);
    if (options?.enforceInventory !== false && requestedUnits > deriveInventoryAvailable(product)) {
      throw new Error(`Requested quantity for ${product.name} exceeds available inventory.`);
    }
  });
}
