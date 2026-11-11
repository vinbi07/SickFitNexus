import type { Product, ProductBarcode } from "@/types/domain";
import { getDisplaySku } from "@/utils/lookbook";
import { linkedProduct, normalizeUpc } from "@/utils/poImportMatching";

// Options for picking what a PO line bills: Nexus products (searchable by their linked
// barcode-book entries too) plus barcode-book entries that are not linked to any product.

export type CatalogOption =
  | { kind: "product"; id: string; product: Product; title: string; detail: string; searchText: string; upcs: string[] }
  | { kind: "barcode"; id: string; barcode: ProductBarcode; title: string; detail: string; searchText: string; upcs: string[] };

const MAX_RESULTS = 100;

/** Variant rows share the family name, so add the variant ("... - One Size / Pink") to tell them apart. */
export function invoiceProductName(product: Pick<Product, "name" | "variant_title">) {
  const variant = product.variant_title?.trim();
  return variant && !/^default title$/i.test(variant) ? `${product.name} - ${variant}` : product.name;
}

export function barcodeOptionId(barcodeId: string) {
  return `barcode:${barcodeId}`;
}

function tokenize(text: string | null | undefined) {
  return String(text ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function buildCatalogOptions(products: Product[], barcodes: ProductBarcode[]): CatalogOption[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const barcodesByProduct = new Map<string, ProductBarcode[]>();
  const options: CatalogOption[] = [];

  for (const barcode of barcodes) {
    const linked = linkedProduct(barcode, productsById);
    if (linked) {
      barcodesByProduct.set(linked.id, [...(barcodesByProduct.get(linked.id) ?? []), barcode]);
      continue;
    }
    options.push({
      kind: "barcode",
      id: barcodeOptionId(barcode.id),
      barcode,
      title: barcode.product_name || barcode.sku,
      detail: ["Barcode book", barcode.sku, barcode.barcode_upc ? `UPC ${barcode.barcode_upc}` : null, "not linked to a product"]
        .filter(Boolean)
        .join(" · "),
      searchText: [barcode.product_name, barcode.sku, barcode.size, barcode.collection, barcode.barcode_upc].join(" ").toLowerCase(),
      upcs: [normalizeUpc(barcode.barcode_upc)].filter(Boolean),
    });
  }

  for (const product of products) {
    const linkedBarcodes = barcodesByProduct.get(product.id) ?? [];
    const upcs = [...new Set([product.upc, ...linkedBarcodes.map((barcode) => barcode.barcode_upc)].map(normalizeUpc).filter(Boolean))];
    const barcodeNames = [...new Set(linkedBarcodes.map((barcode) => barcode.product_name).filter(Boolean))];
    options.push({
      kind: "product",
      id: product.id,
      product,
      title: invoiceProductName(product),
      detail: [getDisplaySku(product), upcs.length ? `UPC ${upcs.join(", ")}` : null, ...barcodeNames].filter(Boolean).join(" · "),
      searchText: [
        product.name,
        product.variant_title,
        product.sku,
        product.upc,
        ...linkedBarcodes.flatMap((barcode) => [barcode.product_name, barcode.sku, barcode.size, barcode.barcode_upc]),
      ]
        .join(" ")
        .toLowerCase(),
      upcs,
    });
  }

  return options.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Typed text: every word must appear somewhere (name, variant, SKU, UPC or barcode-book name),
 * so "texas pink" finds "SickFit Dallas Texas ... - One Size / Pink". With nothing typed, the
 * options closest to the PO line (same UPC first, then shared words) come first.
 */
export function searchCatalogOptions(
  options: CatalogOption[],
  query: string,
  hint?: { text?: string | null; upc?: string | null },
): CatalogOption[] {
  const terms = tokenize(query);
  if (terms.length) {
    return options
      .filter((option) => terms.every((term) => option.searchText.includes(term)))
      .map((option) => ({ option, inTitle: terms.every((term) => option.title.toLowerCase().includes(term)) }))
      .sort((a, b) => Number(b.inTitle) - Number(a.inTitle))
      .slice(0, MAX_RESULTS)
      .map(({ option }) => option);
  }

  const hintUpc = normalizeUpc(hint?.upc);
  const hintTerms = new Set(tokenize(hint?.text).filter((term) => term.length > 2));
  if (!hintUpc && !hintTerms.size) return options.slice(0, MAX_RESULTS);
  return options
    .map((option) => {
      const words = new Set(tokenize(option.searchText));
      let score = [...hintTerms].filter((term) => words.has(term)).length;
      if (hintUpc && option.upcs.includes(hintUpc)) score += 100;
      return { option, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(({ option }) => option);
}
