import { describe, expect, it } from "vitest";
import type { PoLineItem, ProductBarcode, SockCard } from "@/types/domain";
import { hasStopIssues, validateManufacturerOrder } from "@/utils/manufacturerOrderValidation";

const card = { id: "card-1", name: "Crew card", on_hand: 10000 } as SockCard;

const line = (overrides: Partial<PoLineItem>): Partial<PoLineItem> => ({
  product_name: "Texas Crew",
  sku: "CRW-TX",
  quantity_ordered: 600,
  pack_pairs: 1,
  sock_card_id: card.id,
  art_status: "ON FILE",
  ...overrides,
});

const book = [
  { sku: "CRW-TX", barcode_upc: "036000291452" },
  { sku: "ANK-BLK", barcode_upc: "4006381333931" },
] as ProductBarcode[];

const messages = (lines: Array<Partial<PoLineItem>>, barcodes: ProductBarcode[] = book) =>
  validateManufacturerOrder(lines, [card], barcodes).map((issue) => `${issue.severity}: ${issue.message}`);

describe("barcode checks", () => {
  it("passes a line whose barcode matches the barcode book", () => {
    expect(messages([line({ upc: "036000291452" })])).toEqual([]);
  });

  it("stops on a bad check digit", () => {
    const issues = validateManufacturerOrder([line({ upc: "036000291453" })], [card], book);
    expect(hasStopIssues(issues)).toBe(true);
    expect(issues[0].message).toBe("Barcode 036000291453: Check digit should be 2.");
  });

  it("stops when two designs share one barcode", () => {
    expect(
      messages([
        line({ upc: "036000291452" }),
        line({ sku: "CRW-UT", product_name: "Utah Crew", upc: "036000291452" }),
      ]),
    ).toContain("stop: Barcode 036000291452 is on lines 1 and 2. Each design needs its own code.");
  });

  it("warns when a code is missing from the book or belongs to another SKU", () => {
    expect(messages([line({ upc: "012345678905" })])).toEqual([
      "warning: Barcode 012345678905 is not in the barcode book. Confirm it against GS1 before printing.",
    ]);
    expect(messages([line({ upc: "4006381333931" })])).toEqual([
      "warning: Barcode 4006381333931 belongs to ANK-BLK in the barcode book.",
    ]);
  });

  it("skips book checks when no barcode book is loaded", () => {
    expect(messages([line({ upc: "012345678905" })], [])).toEqual([]);
  });
});
