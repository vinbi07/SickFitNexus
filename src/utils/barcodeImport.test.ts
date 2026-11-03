import { describe, expect, it } from "vitest";
import { planBarcodeImport, type BarcodeImportRow } from "@/utils/barcodeImport";

const row = (sku: string, overrides: Partial<BarcodeImportRow> = {}): BarcodeImportRow => ({
  sku,
  handle: null,
  product_name: `${sku} name`,
  collection: null,
  pack_quantity: null,
  pack_unit: null,
  size: null,
  barcode_upc: null,
  ...overrides,
});

const book = (id: string, sku: string, overrides: Record<string, unknown> = {}) => ({
  id,
  sku,
  handle: "old-handle",
  product_name: "Old name",
  collection: "Crew",
  pack_quantity: 3,
  pack_unit: "pair",
  size: "M",
  barcode_upc: "850065635620",
  product_barcode_links: [] as Array<{ product_id: string }>,
  ...overrides,
});

describe("planBarcodeImport", () => {
  it("updates a SKU already in the book and keeps old values for blank cells", () => {
    const plan = planBarcodeImport([row("CRW-M", { barcode_upc: "850065635538" })], [book("b1", "CRW-M")], []);
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: "b1",
        sku: "CRW-M",
        product_name: "CRW-M name",
        handle: "old-handle",
        collection: "Crew",
        pack_quantity: 3,
        pack_unit: "pair",
        size: "M",
        barcode_upc: "850065635538",
      },
    ]);
  });

  it("adds new SKUs and updates only the oldest of repeated book rows", () => {
    const plan = planBarcodeImport([row("NEW"), row("CRW-M")], [book("first", "CRW-M"), book("second", "CRW-M")], []);
    expect(plan.inserts.map((insert) => insert.sku)).toEqual(["NEW"]);
    expect(plan.updates.map((update) => update.id)).toEqual(["first"]);
  });

  it("uses the last row when a SKU repeats in the file", () => {
    const plan = planBarcodeImport([row("A", { size: "S" }), row("A", { size: "L" })], [], []);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].size).toBe("L");
    expect(plan.repeatedSkus).toEqual(["A"]);
  });

  it("links to the exact SKU, skipping links that already exist", () => {
    const catalog = [
      { id: "p1", sku: "CRW-M" },
      { id: "p2", sku: "CRW-S" },
    ];
    const plan = planBarcodeImport(
      [row("CRW-M"), row("CRW-S"), row("GONE")],
      [book("b1", "CRW-M", { product_barcode_links: [{ product_id: "p1" }] })],
      catalog,
    );
    expect(plan.linksBySku.has("CRW-M")).toBe(false);
    expect(plan.linksBySku.get("CRW-S")).toEqual(["p2"]);
    expect(plan.unmatchedSkus).toEqual(["GONE"]);
  });

  it("falls back to the one live Shopify-suffixed variant", () => {
    const catalog = [
      { id: "live", sku: "TOTE--4451" },
      { id: "old", sku: "TOTE--1111", shopify_removed_at: "2026-10-01T00:00:00Z" },
      { id: "x", sku: "SOCK--1" },
      { id: "y", sku: "SOCK--2" },
    ];
    const plan = planBarcodeImport([row("TOTE"), row("SOCK")], [], catalog);
    expect(plan.linksBySku.get("TOTE")).toEqual(["live"]);
    expect(plan.unmatchedSkus).toEqual(["SOCK"]);
  });
});
