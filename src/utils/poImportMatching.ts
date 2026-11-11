import type { InvoiceWarning, Product, ProductBarcode, Retailer, RetailerProductAlias } from "@/types/domain";
import type { ExtractedPoLine, ExtractedPurchaseOrder } from "@/types/poImport";
import { deriveInventoryAvailable } from "@/utils/lookbook";
import { isIgnoredProduct } from "@/utils/operations";

export type MatchSource = "alias" | "upc" | "barcode" | "sku" | "manual" | "none";

export interface ReviewLine {
  extracted: ExtractedPoLine;
  productId: string | null;
  /** Barcode-book row used when no Nexus product is linked: the line bills it, but holds no stock. */
  barcodeId: string | null;
  matchSource: MatchSource;
  /** Stock left for this line after earlier POs in the batch; null when unmatched or excluded. */
  available: number | null;
  /** Units that will be held when the invoice is created: min(PO quantity, available). */
  allocateUnits: number;
}

export interface ReviewPurchaseOrder {
  key: string;
  extracted: ExtractedPurchaseOrder;
  retailerId: string | null;
  duplicateOfPoId: string | null;
  include: boolean;
  lines: ReviewLine[];
  warnings: InvoiceWarning[];
}

export interface CatalogIndex {
  productsById: Map<string, Product>;
  barcodesById: Map<string, ProductBarcode>;
  byUpc: Map<string, Product>;
  byBarcodeUpc: Map<string, Product>;
  /** Barcode-book rows with no usable linked product, by UPC. */
  byUnlinkedBarcodeUpc: Map<string, ProductBarcode>;
  bySku: Map<string, Product>;
  aliases: Map<string, Product>;
}

const MONEY_TOLERANCE = 0.005;

/** Digits only, leading zeros dropped, so UPC-A and its EAN-13 form compare equal. */
export function normalizeUpc(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** Uppercase, no whitespace, and the common "PO1" -> "P01" letter-O typo fixed. */
export function normalizeSku(value: string | null | undefined): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(^|-)PO(\d)/g, "$1P0$2");
}

function normalizeCompanyName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(the|llc|inc|co|corp|company|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasKey(retailerId: string, retailerItemNumber: string) {
  return `${retailerId}:${retailerItemNumber.trim()}`;
}

export function buildCatalogIndex(
  products: Product[],
  barcodes: ProductBarcode[],
  aliases: RetailerProductAlias[],
): CatalogIndex {
  const usable = products.filter((product) => !isIgnoredProduct(product));
  const productsById = new Map(usable.map((product) => [product.id, product]));
  const byUpc = new Map<string, Product>();
  const bySku = new Map<string, Product>();
  for (const product of usable) {
    const upc = normalizeUpc(product.upc);
    if (upc && !byUpc.has(upc)) byUpc.set(upc, product);
    const sku = normalizeSku(product.sku);
    if (sku && !bySku.has(sku)) bySku.set(sku, product);
  }

  const byBarcodeUpc = new Map<string, Product>();
  const byUnlinkedBarcodeUpc = new Map<string, ProductBarcode>();
  for (const barcode of barcodes) {
    const upc = normalizeUpc(barcode.barcode_upc);
    if (!upc) continue;
    const linked = linkedProduct(barcode, productsById);
    if (linked) {
      if (!byBarcodeUpc.has(upc)) byBarcodeUpc.set(upc, linked);
    } else if (!byUnlinkedBarcodeUpc.has(upc)) {
      byUnlinkedBarcodeUpc.set(upc, barcode);
    }
  }

  const aliasMap = new Map<string, Product>();
  for (const alias of aliases) {
    const product = productsById.get(alias.product_id);
    if (product) aliasMap.set(aliasKey(alias.retailer_id, alias.retailer_item_number), product);
  }

  return {
    productsById,
    barcodesById: new Map(barcodes.map((barcode) => [barcode.id, barcode])),
    byUpc,
    byBarcodeUpc,
    byUnlinkedBarcodeUpc,
    bySku,
    aliases: aliasMap,
  };
}

/** First linked product that is still in use, or null when the barcode points at nothing usable. */
export function linkedProduct(barcode: ProductBarcode, productsById: Map<string, Product>) {
  return (
    (barcode.product_barcode_links ?? [])
      .map((link) => productsById.get(link.product_id))
      .find((product): product is Product => Boolean(product)) ?? null
  );
}

export function matchLine(
  line: ExtractedPoLine,
  retailerId: string | null,
  index: CatalogIndex,
): { productId: string | null; barcodeId: string | null; matchSource: MatchSource } {
  if (retailerId && line.retailer_item_number) {
    const aliased = index.aliases.get(aliasKey(retailerId, line.retailer_item_number));
    if (aliased) return { productId: aliased.id, barcodeId: null, matchSource: "alias" };
  }
  const upc = normalizeUpc(line.upc);
  if (upc) {
    const byUpc = index.byUpc.get(upc);
    if (byUpc) return { productId: byUpc.id, barcodeId: null, matchSource: "upc" };
    const byBarcode = index.byBarcodeUpc.get(upc);
    if (byBarcode) return { productId: byBarcode.id, barcodeId: null, matchSource: "barcode" };
  }
  const sku = normalizeSku(line.vendor_style);
  if (sku) {
    const bySku = index.bySku.get(sku);
    if (bySku) return { productId: bySku.id, barcodeId: null, matchSource: "sku" };
  }
  const unlinked = upc ? index.byUnlinkedBarcodeUpc.get(upc) : null;
  if (unlinked) return { productId: null, barcodeId: unlinked.id, matchSource: "barcode" };
  return { productId: null, barcodeId: null, matchSource: "none" };
}

/** A line can be invoiced once it points at a product or at least a barcode-book entry. */
export function isLineMapped(line: Pick<ReviewLine, "productId" | "barcodeId">) {
  return Boolean(line.productId || line.barcodeId);
}

export function matchRetailer(billToCompany: string | null | undefined, retailers: Retailer[]): Retailer | null {
  const target = normalizeCompanyName(billToCompany);
  if (!target) return null;
  const candidates = retailers.filter((retailer) =>
    [retailer.name, retailer.billing_company_name].some((name) => normalizeCompanyName(name) === target),
  );
  // Prefer the parent account over store-level children with the same name.
  return candidates.find((retailer) => !retailer.parent_retailer_id) ?? candidates[0] ?? null;
}

function shipSortKey(po: ReviewPurchaseOrder) {
  return `${po.extracted.start_ship_date ?? po.extracted.order_date ?? "9999-12-31"}|${po.extracted.po_number}`;
}

/**
 * Recomputes every warning and stock hold on the batch. Stock is checked cumulatively: POs
 * are walked in ship-date order, each line holds what is left of its product, and a PO is
 * warned when it asks for more than that. Invoices still bill the full PO quantity.
 */
export function computeBatchWarnings(
  purchaseOrders: ReviewPurchaseOrder[],
  productsById: Map<string, Product>,
): ReviewPurchaseOrder[] {
  const warningsByKey = new Map<string, InvoiceWarning[]>(purchaseOrders.map((po) => [po.key, []]));

  for (const po of purchaseOrders) {
    const warnings = warningsByKey.get(po.key)!;
    const lineTotal = po.extracted.lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0);
    if (po.extracted.total_cost != null && Math.abs(lineTotal - po.extracted.total_cost) > MONEY_TOLERANCE) {
      warnings.push({
        kind: "totals",
        message: `Line items add up to ${lineTotal.toFixed(2)} but the PO total is ${po.extracted.total_cost.toFixed(2)}.`,
      });
    }

    for (const line of po.lines) {
      const label = line.extracted.description ?? line.extracted.vendor_style ?? "line";
      if (!line.productId && line.barcodeId) {
        warnings.push({
          kind: "stock",
          message: `${label} (UPC ${line.extracted.upc ?? "none"}) is in the barcode book but not linked to a Nexus product, so no stock is held. Link it on the Barcodes page to track stock.`,
          sku: line.extracted.vendor_style,
        });
        continue;
      }
      if (!line.productId) {
        warnings.push({
          kind: "unmatched",
          message: `${label} (UPC ${line.extracted.upc ?? "none"}) is not matched to a product.`,
          sku: line.extracted.vendor_style,
        });
        continue;
      }
      const product = productsById.get(line.productId);
      const wholesale = Number(product?.wholesale_price ?? 0);
      if (product && wholesale > 0 && Math.abs(wholesale - line.extracted.unit_cost) > MONEY_TOLERANCE) {
        warnings.push({
          kind: "price",
          message: `${product.name}: PO price ${line.extracted.unit_cost.toFixed(2)} differs from wholesale ${wholesale.toFixed(2)}. Invoicing at the PO price.`,
          product_id: product.id,
          sku: product.sku,
        });
      }
    }
  }

  // Different UPCs landing on one product usually means a mislinked barcode in the catalog.
  const upcsByProduct = new Map<string, Set<string>>();
  for (const po of purchaseOrders) {
    for (const line of po.lines) {
      const upc = normalizeUpc(line.extracted.upc);
      if (!line.productId || !upc) continue;
      upcsByProduct.set(line.productId, (upcsByProduct.get(line.productId) ?? new Set()).add(upc));
    }
  }
  for (const po of purchaseOrders) {
    const flagged = new Set<string>();
    for (const line of po.lines) {
      const upcs = line.productId ? upcsByProduct.get(line.productId) : null;
      if (!line.productId || !upcs || upcs.size < 2 || flagged.has(line.productId)) continue;
      flagged.add(line.productId);
      const product = productsById.get(line.productId);
      warningsByKey.get(po.key)!.push({
        kind: "unmatched",
        message: `UPCs ${[...upcs].join(", ")} all match ${product?.name ?? "one product"} (${product?.sku ?? ""}). Check the barcode links and pick the right product for each line.`,
        product_id: line.productId,
        sku: product?.sku ?? null,
      });
    }
  }

  // Walk included POs in ship-date order, drawing each line from what is left of the product's
  // stock. The invoice still bills the full quantity; only the hold is capped.
  const remaining = new Map<string, number>();
  const allocationByLine = new Map<string, { available: number; allocateUnits: number }>();
  const included = purchaseOrders.filter((po) => po.include).sort((a, b) => shipSortKey(a).localeCompare(shipSortKey(b)));
  for (const po of included) {
    const shortByProduct = new Map<string, number>();
    po.lines.forEach((line, lineIndex) => {
      if (!line.productId) return;
      const product = productsById.get(line.productId);
      if (!product) return;
      const available = remaining.get(product.id) ?? deriveInventoryAvailable(product);
      const quantity = Math.max(Number(line.extracted.quantity ?? 0), 0);
      const allocateUnits = Math.min(quantity, available);
      remaining.set(product.id, available - allocateUnits);
      allocationByLine.set(`${po.key}:${lineIndex}`, { available, allocateUnits });
      if (quantity > allocateUnits) {
        shortByProduct.set(product.id, (shortByProduct.get(product.id) ?? 0) + quantity - allocateUnits);
      }
    });
    for (const [productId, short] of shortByProduct) {
      const product = productsById.get(productId)!;
      warningsByKey.get(po.key)!.push({
        kind: "stock",
        message: `Short ${short} of ${product.name} (${product.sku}). The invoice bills the full quantity; only what is in stock is held.`,
        product_id: productId,
        sku: product.sku,
      });
    }
  }

  return purchaseOrders.map((po) => ({
    ...po,
    warnings: warningsByKey.get(po.key) ?? [],
    lines: po.lines.map((line, lineIndex) => {
      const allocation = allocationByLine.get(`${po.key}:${lineIndex}`);
      return { ...line, available: allocation?.available ?? null, allocateUnits: allocation?.allocateUnits ?? 0 };
    }),
  }));
}

export function buildReview(input: {
  extracted: ExtractedPurchaseOrder[];
  index: CatalogIndex;
  retailers: Retailer[];
  existingPurchaseOrders: Array<{ id: string; po_number: string; retailer_id: string | null }>;
}): ReviewPurchaseOrder[] {
  const reviewed = input.extracted.map((extracted, position) => {
    const retailer = matchRetailer(extracted.bill_to.company, input.retailers);
    const retailerId = retailer?.id ?? null;
    const duplicate = input.existingPurchaseOrders.find(
      (existing) =>
        existing.po_number.trim() === extracted.po_number.trim() &&
        (!retailerId || !existing.retailer_id || existing.retailer_id === retailerId),
    );
    return {
      key: `${extracted.po_number}-${position}`,
      extracted,
      retailerId,
      duplicateOfPoId: duplicate?.id ?? null,
      include: !duplicate,
      lines: extracted.lines.map((line) => ({
        extracted: line,
        ...matchLine(line, retailerId, input.index),
        available: null,
        allocateUnits: 0,
      })),
      warnings: [],
    } satisfies ReviewPurchaseOrder;
  });
  return computeBatchWarnings(reviewed, input.index.productsById);
}
