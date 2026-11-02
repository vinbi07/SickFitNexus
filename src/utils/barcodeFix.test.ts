import { describe, expect, it } from "vitest";
import { assessProductBarcode, checkBarcode, suggestBarcodeRepairs } from "@/utils/barcode";
import { planBarcodeFix } from "@/utils/barcodeFix";

const other = { id: "o1", sku: "OTHER", name: "Other shorts", adminUrl: null };

describe("suggestBarcodeRepairs", () => {
  it("puts back dropped leading zeros", () => {
    // 012345678905 is a valid UPC-A; a spreadsheet stored it as 12345678905.
    const repairs = suggestBarcodeRepairs("12345678905");
    expect(repairs[0].code).toBe("012345678905");
    expect(checkBarcode(repairs[0].code).ok).toBe(true);
  });

  it("offers the correct check digit for a full-length code", () => {
    const repairs = suggestBarcodeRepairs("012345678901");
    expect(repairs.map((repair) => repair.code)).toContain("012345678905");
  });

  it("has nothing to suggest for a valid code", () => {
    expect(suggestBarcodeRepairs("012345678905")).toEqual([]);
  });
});

describe("planBarcodeFix", () => {
  const duplicates = new Map([["012345678905", ["MINE", "OTHER"]]]);

  it("says this variant keeps a duplicated code the barcode book gives it", () => {
    const assessment = assessProductBarcode("012345678905", ["012345678905"], duplicates, "MINE");
    const plan = planBarcodeFix({ upc: "012345678905", assessment, bookCodes: ["012345678905"], conflicts: [other] });
    expect(plan?.status).toBe("duplicate");
    expect(plan?.keeper).toBe("this");
    expect(plan?.conflicts).toEqual([other]);
  });

  it("says this variant should change when the book gives it another code", () => {
    const assessment = assessProductBarcode("012345678905", [], duplicates, "MINE");
    const plan = planBarcodeFix({ upc: "012345678905", assessment, bookCodes: ["036000291452"], conflicts: [other] });
    expect(plan?.keeper).toBe("other");
    expect(plan?.bookCode).toBe("036000291452");
  });

  it("returns null when nothing is wrong", () => {
    const assessment = assessProductBarcode("012345678905", [], new Map(), "MINE");
    expect(planBarcodeFix({ upc: "012345678905", assessment, bookCodes: [], conflicts: [] })).toBeNull();
  });
});
