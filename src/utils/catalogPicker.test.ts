import { describe, expect, it } from "vitest";
import type { Product, ProductBarcode } from "@/types/domain";
import { buildCatalogOptions, invoiceProductName, searchCatalogOptions } from "@/utils/catalogPicker";

function product(overrides: Partial<Product>): Product {
  return { id: "p", sku: "SKU", name: "Name", upc: null, variant_title: null, ignored: false, ...overrides } as Product;
}

function barcode(overrides: Partial<ProductBarcode>): ProductBarcode {
  return {
    id: "b",
    sku: "SF-1",
    handle: null,
    product_name: "Barcode",
    collection: null,
    pack_quantity: 1,
    pack_unit: null,
    size: null,
    barcode_upc: null,
    created_at: "",
    updated_at: "",
    product_barcode_links: [],
    ...overrides,
  };
}

const pink = product({
  id: "pink",
  sku: "CRW-P01-LTD-TX-PNK",
  name: "SickFit Dallas Texas Compression Socks – 2 Pack",
  variant_title: "One Size / Pink",
  upc: "850065635187",
});
const utah = product({ id: "utah", sku: "CRW-P01-UTA-BRN-OS", name: "SickFit Utah Compression Socks", variant_title: "Brown" });
const utahBarcode = barcode({
  id: "bc-utah",
  product_name: "SF Utah Brown Crew",
  barcode_upc: "850065635873",
  product_barcode_links: [{ id: "l", barcode_id: "bc-utah", product_id: "utah", created_at: "" }],
});
const greyBarcode = barcode({ id: "bc-grey", sku: "CRW-P01-TXS-GRY-OS", product_name: "Texas Crew 1 Pair Grey", barcode_upc: "850065635132" });

const options = buildCatalogOptions([pink, utah], [utahBarcode, greyBarcode]);

describe("catalog picker", () => {
  it("names variants so they can be told apart", () => {
    expect(invoiceProductName(pink)).toBe("SickFit Dallas Texas Compression Socks – 2 Pack - One Size / Pink");
    expect(invoiceProductName({ name: "Plain", variant_title: "Default Title" })).toBe("Plain");
  });

  it("folds linked barcodes into their product and lists unlinked ones on their own", () => {
    expect(options.map((option) => option.id).sort()).toEqual(["barcode:bc-grey", "pink", "utah"]);
    expect(options.find((option) => option.id === "utah")!.upcs).toEqual(["850065635873"]);
  });

  it("matches every typed word against name, variant, SKU, UPC and barcode names", () => {
    expect(searchCatalogOptions(options, "texas pink").map((option) => option.id)).toEqual(["pink"]);
    expect(searchCatalogOptions(options, "utah brown crew").map((option) => option.id)).toEqual(["utah"]);
    expect(searchCatalogOptions(options, "635132").map((option) => option.id)).toEqual(["barcode:bc-grey"]);
    expect(searchCatalogOptions(options, "grey").map((option) => option.kind)).toEqual(["barcode"]);
    expect(searchCatalogOptions(options, "texas purple")).toEqual([]);
  });

  it("puts the PO line's own UPC first when nothing is typed", () => {
    const ranked = searchCatalogOptions(options, "", { text: "Texas Grey Socks", upc: "850065635132" });
    expect(ranked[0].id).toBe("barcode:bc-grey");
  });
});
