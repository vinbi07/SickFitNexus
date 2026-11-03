import type { Product, ProductBarcode } from "@/types/domain";
import { isIgnoredProduct } from "@/utils/operations";

/** One cleaned CSV row; blank optional cells are null. */
export interface BarcodeImportRow {
  sku: string;
  handle: string | null;
  product_name: string;
  collection: string | null;
  pack_quantity: number | null;
  pack_unit: string | null;
  size: string | null;
  barcode_upc: string | null;
}

type ExistingBarcode = Pick<
  ProductBarcode,
  "id" | "sku" | "handle" | "product_name" | "collection" | "pack_quantity" | "pack_unit" | "size" | "barcode_upc"
> & { product_barcode_links?: Array<{ product_id: string }> | null };

type CatalogProduct = Pick<Product, "id" | "sku"> & Partial<Pick<Product, "ignored" | "shopify_status" | "shopify_removed_at">>;

export interface BarcodeImportPlan {
  inserts: BarcodeImportRow[];
  /** Existing rows merged with the CSV; blank CSV cells keep the old value. */
  updates: Array<BarcodeImportRow & { id: string }>;
  /** Products each SKU should be linked to (only links not already there). */
  linksBySku: Map<string, string[]>;
  /** SKUs with no product in Nexus to link to. */
  unmatchedSkus: string[];
  /** SKUs that appeared more than once in the file; the last row wins. */
  repeatedSkus: string[];
}

/**
 * Nexus suffixes Shopify SKUs that collide ("SKU--12345"). A barcode for the
 * plain SKU belongs to the exact match, or to the one live suffixed variant
 * when there is exactly one.
 */
function matchProducts(sku: string, bySku: Map<string, CatalogProduct[]>, catalog: CatalogProduct[]) {
  const exact = bySku.get(sku);
  if (exact?.length) return exact.map((product) => product.id);
  const suffixed = catalog.filter((product) => product.sku.startsWith(`${sku}--`) && !isIgnoredProduct({ ...product, ignored: Boolean(product.ignored) }));
  return suffixed.length === 1 ? [suffixed[0].id] : [];
}

/**
 * Decides what a barcode CSV does: update the row already in the barcode
 * book for each SKU, add the rest, and link each SKU to its product.
 */
export function planBarcodeImport(
  rows: BarcodeImportRow[],
  existing: ExistingBarcode[],
  catalog: CatalogProduct[],
): BarcodeImportPlan {
  const latest = new Map<string, BarcodeImportRow>();
  const repeated = new Set<string>();
  for (const row of rows) {
    if (latest.has(row.sku)) repeated.add(row.sku);
    latest.set(row.sku, row);
  }

  // Older imports may have left several rows per SKU; the oldest is the one kept up to date.
  const existingBySku = new Map<string, ExistingBarcode>();
  for (const barcode of existing) if (!existingBySku.has(barcode.sku)) existingBySku.set(barcode.sku, barcode);

  const bySku = new Map<string, CatalogProduct[]>();
  for (const product of catalog) bySku.set(product.sku, [...(bySku.get(product.sku) ?? []), product]);

  const inserts: BarcodeImportRow[] = [];
  const updates: BarcodeImportPlan["updates"] = [];
  const linksBySku = new Map<string, string[]>();
  const unmatchedSkus: string[] = [];

  for (const row of latest.values()) {
    const current = existingBySku.get(row.sku);
    if (current) {
      updates.push({
        id: current.id,
        sku: row.sku,
        product_name: row.product_name,
        handle: row.handle ?? current.handle,
        collection: row.collection ?? current.collection,
        pack_quantity: row.pack_quantity ?? current.pack_quantity,
        pack_unit: row.pack_unit ?? current.pack_unit,
        size: row.size ?? current.size,
        barcode_upc: row.barcode_upc ?? current.barcode_upc,
      });
    } else {
      inserts.push(row);
    }

    const productIds = matchProducts(row.sku, bySku, catalog);
    if (!productIds.length) {
      unmatchedSkus.push(row.sku);
      continue;
    }
    const alreadyLinked = new Set((current?.product_barcode_links ?? []).map((link) => link.product_id));
    const missing = productIds.filter((id) => !alreadyLinked.has(id));
    if (missing.length) linksBySku.set(row.sku, missing);
  }

  return { inserts, updates, linksBySku, unmatchedSkus, repeatedSkus: [...repeated] };
}
