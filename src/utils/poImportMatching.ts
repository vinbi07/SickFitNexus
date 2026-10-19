import type { InvoiceWarning, Product, ProductBarcode, Retailer, RetailerProductAlias } from "@/types/domain";
import type { ExtractedPoLine, ExtractedPurchaseOrder } from "@/types/poImport";
import { deriveInventoryAvailable } from "@/utils/lookbook";

export type MatchSource = "alias" | "upc" | "barcode" | "sku" | "manual" | "none";

export interface ReviewLine {
  extracted: ExtractedPoLine;
  productId: string | null;
  matchSource: MatchSource;
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
  byUpc: Map<string, Product>;
  byBarcodeUpc: Map<string, Product>;
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
  const usable = products.filter((product) => !product.ignored);
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
  for (const barcode of barcodes) {
    const upc = normalizeUpc(barcode.barcode_upc);
    if (!upc || byBarcodeUpc.has(upc)) continue;
    const linked = (barcode.product_barcode_links ?? [])
      .map((link) => productsById.get(link.product_id))
      .find((product): product is Product => Boolean(product));
    if (linked) byBarcodeUpc.set(upc, linked);
  }

  const aliasMap = new Map<string, Product>();
  for (const alias of aliases) {
    const product = productsById.get(alias.product_id);
    if (product) aliasMap.set(aliasKey(alias.retailer_id, alias.retailer_item_number), product);
  }

  return { productsById, byUpc, byBarcodeUpc, bySku, aliases: aliasMap };
}

export function matchLine(
  line: ExtractedPoLine,
  retailerId: string | null,
  index: CatalogIndex,
): { productId: string | null; matchSource: MatchSource } {
  if (retailerId && line.retailer_item_number) {
    const aliased = index.aliases.get(aliasKey(retailerId, line.retailer_item_number));
    if (aliased) return { productId: aliased.id, matchSource: "alias" };
  }
  const upc = normalizeUpc(line.upc);
  if (upc) {
    const byUpc = index.byUpc.get(upc);
    if (byUpc) return { productId: byUpc.id, matchSource: "upc" };
    const byBarcode = index.byBarcodeUpc.get(upc);
    if (byBarcode) return { productId: byBarcode.id, matchSource: "barcode" };
  }
  const sku = normalizeSku(line.vendor_style);
  if (sku) {
    const bySku = index.bySku.get(sku);
    if (bySku) return { productId: bySku.id, matchSource: "sku" };
  }
  return { productId: null, matchSource: "none" };
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
 * Recomputes every warning on the batch. Stock is checked cumulatively: POs are
 * walked in ship-date order and each one is warned once the batch's running demand
 * for a product passes what is available. Invoices still bill the full PO quantity.
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

  const runningDemand = new Map<string, number>();
  const included = purchaseOrders.filter((po) => po.include).sort((a, b) => shipSortKey(a).localeCompare(shipSortKey(b)));
  for (const po of included) {
    const demandThisPo = new Map<string, number>();
    for (const line of po.lines) {
      if (!line.productId) continue;
      demandThisPo.set(line.productId, (demandThisPo.get(line.productId) ?? 0) + line.extracted.quantity);
    }
    for (const [productId, quantity] of demandThisPo) {
      const product = productsById.get(productId);
      if (!product) continue;
      const available = deriveInventoryAvailable(product);
      const before = runningDemand.get(productId) ?? 0;
      const after = before + quantity;
      runningDemand.set(productId, after);
      if (after > available) {
        const shortHere = Math.min(quantity, after - available);
        warningsByKey.get(po.key)!.push({
          kind: "stock",
          message: `Short ${shortHere} of ${product.name} (${product.sku}): ${available} available, ${after} requested by this batch through PO ${po.extracted.po_number}.`,
          product_id: productId,
          sku: product.sku,
        });
      }
    }
  }

  return purchaseOrders.map((po) => ({ ...po, warnings: warningsByKey.get(po.key) ?? [] }));
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
      lines: extracted.lines.map((line) => ({ extracted: line, ...matchLine(line, retailerId, input.index) })),
      warnings: [],
    } satisfies ReviewPurchaseOrder;
  });
  return computeBatchWarnings(reviewed, input.index.productsById);
}
