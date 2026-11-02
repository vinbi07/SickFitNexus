import { describe, expect, it } from "vitest";
import { assessProductBarcode, checkBarcode, findDuplicateBarcodes, normalizeBarcode } from "@/utils/barcode";

describe("checkBarcode", () => {
  it("accepts valid UPC-A and EAN-13 codes", () => {
    expect(checkBarcode("036000291452")).toEqual({ ok: true });
    expect(checkBarcode("4006381333931")).toEqual({ ok: true });
    expect(checkBarcode("0360-0029 1452")).toEqual({ ok: true });
  });

  it("explains what is wrong", () => {
    expect(checkBarcode("")).toEqual({ ok: false, reason: "Missing" });
    expect(checkBarcode("03600029145")).toEqual({ ok: false, reason: "11 digits; UPC-A needs 12" });
    expect(checkBarcode("036000291453")).toEqual({ ok: false, reason: "Check digit should be 2" });
    expect(checkBarcode("03600O291452")).toEqual({ ok: false, reason: "Contains letters or symbols" });
  });
});

describe("findDuplicateBarcodes", () => {
  it("flags codes shared by different owners only", () => {
    const duplicates = findDuplicateBarcodes([
      { owner: "SKU-A", code: "036000291452" },
      { owner: "SKU-B", code: "0360 0029 1452" },
      { owner: "SKU-C", code: "4006381333931" },
      { owner: "SKU-C", code: "4006381333931" },
      { owner: "SKU-D", code: null },
    ]);
    expect([...duplicates.entries()]).toEqual([["036000291452", ["SKU-A", "SKU-B"]]]);
  });
});

describe("assessProductBarcode", () => {
  const none = new Map<string, string[]>();

  it("verifies codes that match the barcode book", () => {
    expect(assessProductBarcode("036000291452", ["036000291452"], none, "SKU-A")).toMatchObject({
      status: "verified",
      isProblem: false,
    });
  });

  it("asks for confirmation when only Shopify has the code", () => {
    expect(assessProductBarcode("036000291452", [], none, "SKU-A")).toMatchObject({ status: "unconfirmed", isProblem: false });
  });

  it("treats missing, invalid, duplicate and mismatched codes as problems", () => {
    expect(assessProductBarcode(null, [], none, "SKU-A")).toMatchObject({ status: "missing", isProblem: true });
    expect(assessProductBarcode("036000291453", [], none, "SKU-A")).toMatchObject({ status: "invalid", isProblem: true });
    const shared = new Map([[normalizeBarcode("036000291452"), ["SKU-A", "SKU-B"]]]);
    expect(assessProductBarcode("036000291452", [], shared, "SKU-A")).toMatchObject({
      status: "duplicate",
      detail: "Also used by SKU-B.",
    });
    expect(assessProductBarcode("036000291452", ["4006381333931"], none, "SKU-A")).toMatchObject({
      status: "mismatch",
      detail: "Barcode book says 4006381333931.",
    });
    expect(assessProductBarcode(null, ["4006381333931"], none, "SKU-A").status).toBe("mismatch");
  });
});
