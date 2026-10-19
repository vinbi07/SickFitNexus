import { describe, expect, it } from "vitest";
import type { Product, ProductBarcode, Retailer, RetailerProductAlias } from "@/types/domain";
import type { ExtractedPoLine, ExtractedPurchaseOrder } from "@/types/poImport";
import {
  buildCatalogIndex,
  buildReview,
  matchLine,
  matchRetailer,
  normalizeSku,
  normalizeUpc,
} from "@/utils/poImportMatching";

function product(overrides: Partial<Product>): Product {
  return {
    id: "p",
    parent_product_id: null,
    sku: "SKU",
    upc: null,
    name: "Product",
    variant_title: null,
    variant_sort_order: 0,
    category: null,
    description: null,
    vendor_id: null,
    unit_cost: 0,
    unit_price: 0,
    pack_size: null,
    case_pack_quantity: 1,
    wholesale_price: 8,
    msrp: 20,
    weight: null,
    dimensions: null,
    current_inventory: 0,
    inventory_available: 0,
    inventory_allocated: 0,
    safety_stock: 0,
    image_url: null,
    compliance_docs_required: [],
    compliance_docs_status: null,
    no_bundles: false,
    ignored: false,
    shopify_product_id: null,
    shopify_variant_id: null,
    shopify_handle: null,
    shopify_admin_url: null,
    shopify_storefront_url: null,
    is_shopify_synced: false,
    last_shopify_sync_at: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const texasPink = product({ id: "tx-pink", sku: "CRW-P01-LTD-TX-PNK", upc: "850065635187", name: "SF Texas Pink Socks", current_inventory: 80 });
const texasGrey = product({ id: "tx-grey", sku: "CRW-P01-LTD-TX-GRY", upc: null, name: "Texas Grey Socks", current_inventory: 500 });
const atlWhite = product({ id: "atl-white", sku: "CRW-P01-LTD-ATL-WHT", upc: null, name: "SF ATL White Socks", current_inventory: 500 });
const breastCancer = product({ id: "bca", sku: "CRW-P02-LTD-BCA", upc: "850065635392", name: "SF 2Pack Breast Cancer Socks", wholesale_price: 14, current_inventory: 500 });

const greyBarcode: ProductBarcode = {
  id: "bc-grey",
  sku: "CRW-P01-LTD-TX-GRY",
  handle: null,
  product_name: "Texas Grey Socks",
  collection: null,
  pack_quantity: 1,
  pack_unit: null,
  size: null,
  barcode_upc: "850065635132",
  created_at: "",
  updated_at: "",
  product_barcode_links: [{ id: "l1", barcode_id: "bc-grey", product_id: "tx-grey", created_at: "" }],
};

const paradies = { id: "paradies", name: "Paradies Shops", billing_company_name: "The Paradies Shops LLC", parent_retailer_id: null } as Retailer;

function line(overrides: Partial<ExtractedPoLine>): ExtractedPoLine {
  return {
    line_number: "10",
    retailer_item_number: null,
    vendor_style: null,
    description: null,
    upc: null,
    quantity: 24,
    unit: "EA",
    unit_cost: 8,
    unit_retail: 20,
    ...overrides,
  };
}

function texasPo(poNumber: string, startShip: string): ExtractedPurchaseOrder {
  return {
    po_number: poNumber,
    order_date: "2026-10-05",
    start_ship_date: startShip,
    ship_complete_date: "2026-10-19",
    buyer_name: "Ashlee McDaniel",
    payment_terms_raw: "NT30 Net due in 30 days",
    currency: "USD",
    bill_to: { company: "The Paradies Shops LLC", street: "2849 Paces Ferry Road SE", city: "Atlanta", state: "GA", zip: "30339" },
    ship_to: { store_code: "9512", company: "Paradies AUS", street: "384 Commercial Drive 1", city: "Buda", state: "TX", zip: "78610" },
    additional_ship_to: "W088 (9512)",
    lines: [
      line({ retailer_item_number: "1253640", vendor_style: "CRW-P01-LTD-TX-PNK", description: "SF TEXAS PINK SOCKS", upc: "850065635187" }),
      line({ retailer_item_number: "1215970", vendor_style: "TEXAS GREY SOCKS", description: "Texas Grey Socks", upc: "850065635132" }),
    ],
    total_cost: 384,
    total_retail: 960,
  };
}

const index = buildCatalogIndex([texasPink, texasGrey, atlWhite, breastCancer], [greyBarcode], []);

describe("normalizers", () => {
  it("fixes the letter-O typo in style codes", () => {
    expect(normalizeSku("CRW-PO1-LTD-ATL-WHT")).toBe("CRW-P01-LTD-ATL-WHT");
    expect(normalizeSku(" crw-p01-ltd-tx-pnk ")).toBe("CRW-P01-LTD-TX-PNK");
  });

  it("treats UPC-A and EAN-13 forms as equal", () => {
    expect(normalizeUpc("0850065635187")).toBe(normalizeUpc("850065635187"));
    expect(normalizeUpc("UPC:850065635187")).toBe("850065635187");
  });
});

describe("matchLine", () => {
  it("matches by product UPC", () => {
    expect(matchLine(line({ upc: "850065635187" }), null, index)).toEqual({ productId: "tx-pink", matchSource: "upc" });
  });

  it("matches a style that is not a real SKU through the barcode table", () => {
    expect(matchLine(line({ vendor_style: "TEXAS GREY SOCKS", upc: "850065635132" }), null, index)).toEqual({
      productId: "tx-grey",
      matchSource: "barcode",
    });
  });

  it("falls back to the normalized SKU", () => {
    expect(matchLine(line({ vendor_style: "CRW-PO1-LTD-ATL-WHT", upc: "850065635194" }), null, index)).toEqual({
      productId: "atl-white",
      matchSource: "sku",
    });
  });

  it("prefers a learned retailer alias", () => {
    const alias: RetailerProductAlias = {
      id: "a",
      retailer_id: "paradies",
      retailer_item_number: "999",
      vendor_style: null,
      upc: null,
      product_id: "bca",
      created_at: "",
      updated_at: "",
    };
    const aliasIndex = buildCatalogIndex([texasPink, breastCancer], [], [alias]);
    expect(matchLine(line({ retailer_item_number: "999", upc: "850065635187" }), "paradies", aliasIndex)).toEqual({
      productId: "bca",
      matchSource: "alias",
    });
  });

  it("leaves unknown lines unmatched and skips ignored products", () => {
    const ignoredIndex = buildCatalogIndex([{ ...texasPink, ignored: true }], [], []);
    expect(matchLine(line({ upc: "850065635187" }), null, ignoredIndex).matchSource).toBe("none");
  });
});

describe("matchRetailer", () => {
  it("matches the bill-to company ignoring 'The' and 'LLC'", () => {
    expect(matchRetailer("The Paradies Shops LLC", [paradies])?.id).toBe("paradies");
    expect(matchRetailer("Somebody Else", [paradies])).toBeNull();
  });
});

describe("buildReview", () => {
  it("warns once the batch's running demand passes available stock, in ship-date order", () => {
    const review = buildReview({
      extracted: [
        texasPo("4500894141", "2026-10-12"),
        texasPo("4500894138", "2026-10-09"),
        texasPo("4500894139", "2026-10-09"),
        texasPo("4500894140", "2026-10-09"),
      ],
      index,
      retailers: [paradies],
      existingPurchaseOrders: [],
    });

    const stock = (poNumber: string) =>
      review.find((po) => po.extracted.po_number === poNumber)!.warnings.filter((warning) => warning.kind === "stock");
    // 80 pink available: 24 + 24 + 24 = 72 fits, the fourth PO (latest ship) pushes it to 96.
    expect(stock("4500894138")).toHaveLength(0);
    expect(stock("4500894140")).toHaveLength(0);
    expect(stock("4500894141")).toHaveLength(1);
    expect(stock("4500894141")[0].message).toContain("Short 16");
  });

  it("flags price differences, total mismatches and duplicates", () => {
    const po = texasPo("4500894138", "2026-10-09");
    po.lines[0].unit_cost = 7.5;
    const review = buildReview({
      extracted: [po],
      index,
      retailers: [paradies],
      existingPurchaseOrders: [{ id: "existing", po_number: "4500894138", retailer_id: "paradies" }],
    });
    const kinds = review[0].warnings.map((warning) => warning.kind);
    expect(kinds).toContain("price");
    expect(kinds).toContain("totals");
    expect(review[0].duplicateOfPoId).toBe("existing");
    expect(review[0].include).toBe(false);
  });
});
