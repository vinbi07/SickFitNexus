import type { BarcodeAssessment } from "@/utils/barcode";
import { normalizeBarcode, suggestBarcodeRepairs } from "@/utils/barcode";

export interface BarcodeConflict {
  id: string;
  sku: string;
  name: string;
  adminUrl: string | null;
}

export interface BarcodeFixPlan {
  status: BarcodeAssessment["status"];
  code: string | null;
  /** First barcode-book code linked to this SKU, if any. */
  bookCode: string | null;
  /** Other products carrying the same code (duplicates only). */
  conflicts: BarcodeConflict[];
  /**
   * Who keeps a duplicated code: "this" when the barcode book links it
   * to this SKU, "other" when the book gives this SKU a different code,
   * "unknown" when the book can't say.
   */
  keeper: "this" | "other" | "unknown";
  repairs: Array<{ code: string; reason: string }>;
}

/** What is wrong with a variant's barcode and what evidence there is to fix it. */
export function planBarcodeFix(params: {
  upc: string | null | undefined;
  assessment: BarcodeAssessment;
  bookCodes: string[];
  conflicts: BarcodeConflict[];
}): BarcodeFixPlan | null {
  const { assessment } = params;
  if (!assessment.isProblem) return null;
  const code = normalizeBarcode(params.upc) || null;
  const book = params.bookCodes.map(normalizeBarcode).filter(Boolean);
  const bookCode = book[0] ?? null;
  let keeper: BarcodeFixPlan["keeper"] = "unknown";
  if (assessment.status === "duplicate" && code) {
    if (book.includes(code)) keeper = "this";
    else if (bookCode) keeper = "other";
  }
  return {
    status: assessment.status,
    code,
    bookCode,
    conflicts: assessment.status === "duplicate" ? params.conflicts : [],
    keeper,
    repairs: assessment.status === "invalid" ? suggestBarcodeRepairs(code) : [],
  };
}
