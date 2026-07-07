import type { Buyer, ComplianceSnapshot, LookbookOrderInputLine, LookbookOrderTotals, PoLineItem, Product, PurchaseOrder } from "@/types/domain";

export function deriveInventoryAvailable(product: Pick<Product, "current_inventory" | "inventory_allocated">) {
  return Math.max(Number(product.current_inventory ?? 0) - Number(product.inventory_allocated ?? 0), 0);
}

function getPackDescriptor(product: Pick<Product, "name" | "pack_size">) {
  return [product.pack_size ?? "", product.name ?? ""].join(" ").toLowerCase();
}

type PackMetadata = Pick<Product, "name" | "pack_size" | "pack_quantity" | "pack_unit" | "product_barcode_links">;

function getStructuredPackQuantity(product: PackMetadata) {
  const directQuantity = Number(product.pack_quantity ?? 0);
  if (Number.isFinite(directQuantity) && directQuantity > 0) return directQuantity;

  const linkedQuantity = Number(product.product_barcode_links?.find((link) => Number(link.product_barcodes?.pack_quantity ?? 0) > 0)?.product_barcodes?.pack_quantity ?? 0);
  if (Number.isFinite(linkedQuantity) && linkedQuantity > 0) return linkedQuantity;

  return null;
}

export function getUnitsPerPack(product: PackMetadata) {
  const structuredQuantity = getStructuredPackQuantity(product);
  if (structuredQuantity) return structuredQuantity;

  const descriptor = getPackDescriptor(product);
  if (descriptor.includes("default")) return 1;

  const match = descriptor.match(/(\d+)\s*pack/);
  if (match) {
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const numericMatch = descriptor.match(/(\d+)/);
  if (!numericMatch) return null;

  const parsed = Number(numericMatch[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function resolveCasePackQuantity(product: Pick<Product, "name" | "pack_size" | "pack_quantity" | "pack_unit" | "product_barcode_links" | "case_pack_quantity">) {
  const unitsPerPack = getUnitsPerPack(product);
  if (unitsPerPack && unitsPerPack > 0) {
    return Math.max(Math.floor(12 / unitsPerPack), 1);
  }

  return Math.max(Number(product.case_pack_quantity ?? 1), 1);
}

export function getOrderUnitLabel(product: Pick<Product, "name" | "pack_size">) {
  return (getUnitsPerPack(product) ?? 1) > 1 ? "packs" : "pairs";
}

export function getProductFamilyName(product: Pick<Product, "name"> & Partial<Pick<Product, "parent_products">>) {
  return product.parent_products?.name ?? product.name;
}

export function getDisplaySku(product: Pick<Product, "sku">) {
  const raw = product.sku ?? "";
  const separatorIndex = raw.indexOf("--");
  return separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
}

export function resolveBarcode(product: Pick<Product, "upc" | "product_barcode_links">) {
  const linkedBarcode = product.product_barcode_links?.find((link) => link.product_barcodes?.barcode_upc)?.product_barcodes?.barcode_upc;
  return linkedBarcode ?? product.upc ?? null;
}

export function getDisplayBarcode(product: Pick<Product, "upc" | "product_barcode_links">) {
  return resolveBarcode(product) ?? "Pending";
}

export function getLookbookMetaLine(product: Pick<Product, "upc" | "pack_size">) {
  const parts: string[] = [];

  if (product.upc?.trim()) {
    parts.push(`UPC ${product.upc.trim()}`);
  }

  const packSize = product.pack_size?.trim();
  if (packSize && packSize.toLowerCase() !== "1 pack") {
    parts.push(`Pack ${packSize}`);
  }

  return parts.join(" | ");
}

export function getLookbookRetailPrice(product: Pick<Product, "msrp" | "unit_price">) {
  return Number(product.msrp ?? 0) > 0
    ? Number(product.msrp)
    : Number(product.unit_price ?? 0);
}

export function getLookbookWholesalePrice(product: Pick<Product, "wholesale_price" | "unit_price">) {
  return Number(product.wholesale_price ?? 0) > 0
    ? Number(product.wholesale_price)
    : Number(product.unit_price ?? 0) * 0.665;
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
  const unitCost = getLookbookWholesalePrice(product);
  const unitRetail = getLookbookRetailPrice(product);
  const extendedCost = unitQuantity * unitCost;
  const extendedRetail = unitQuantity * unitRetail;

  return {
    product_id: product.id,
    sku: product.sku,
    upc: resolveBarcode(product),
    product_name: product.name,
    variant_label: getProductVariantLabel(product),
    description: product.name,
    unit: "EA",
    case_pack_quantity: resolveCasePackQuantity(product),
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

export function isBuyerLinkExpired(buyer: Pick<Buyer, "token_expires_at">) {
  return Boolean(buyer.token_expires_at && new Date(buyer.token_expires_at).getTime() < Date.now());
}

export type LookbookStatusLabel = "Draft" | "Ready to Share" | "Shared" | "Converted to PO" | "Archived";

export function hasLookbookAlreadyGeneratedPO(purchaseOrders: Array<Pick<PurchaseOrder, "source_channel" | "status">>) {
  return purchaseOrders.some((po) => po.source_channel === "Lookbook" && po.status !== "Cancelled");
}

export function getLookbookStatusLabel(
  buyer: Pick<Buyer, "token_expires_at" | "last_accessed_at" | "lookbook_status">,
  purchaseOrders: Array<Pick<PurchaseOrder, "source_channel" | "status">>,
): LookbookStatusLabel {
  if (hasLookbookAlreadyGeneratedPO(purchaseOrders)) return "Converted to PO";
  if (isBuyerLinkExpired(buyer)) return "Archived";
  if (buyer.last_accessed_at) return "Shared";
  return buyer.lookbook_status === "ready" ? "Ready to Share" : "Draft";
}

export function mapLookbookItemsToPOLineItems(
  lines: Array<{ product: Product; caseQuantity: number }>,
): Array<Partial<PoLineItem>> {
  return lines
    .filter((line) => Number(line.caseQuantity) > 0)
    .map((line) => buildLineItemFromProduct(line.product, line.caseQuantity));
}

export function validateLookbookBeforePOCreation(lines: LookbookOrderInputLine[], products: Product[]) {
  validateLookbookSelection(lines, products, { enforceInventory: false });
}

export function validateLookbookSelection(lines: LookbookOrderInputLine[], products: Product[], options?: { enforceInventory?: boolean }) {
  const productsById = new Map(products.map((product) => [product.id, product]));

  if (!lines.length) {
    throw new Error("Select at least one product before continuing.");
  }

  lines.forEach((line) => {
    const product = productsById.get(line.product_id);
    if (!product) throw new Error(`Product ${line.sku} is no longer available.`);
    if (!getDisplaySku(product).trim()) throw new Error(`Product ${product.name} is missing a SKU.`);
    if (!isCaseQuantityValid(product, line.requested_case_quantity) || line.requested_case_quantity <= 0) {
      throw new Error(`Product ${product.name} must be ordered in whole case quantities.`);
    }
    const requestedUnits = Number(line.requested_case_quantity) * resolveCasePackQuantity(product);
    if (options?.enforceInventory !== false && requestedUnits > deriveInventoryAvailable(product)) {
      throw new Error(`Requested quantity for ${product.name} exceeds available inventory.`);
    }
  });
}
