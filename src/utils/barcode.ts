/**
 * Barcode integrity: GS1 check digits, duplicates, and whether a product's
 * code matches the barcode book (the GS1-issued codes imported on /barcodes).
 */

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function normalizeBarcode(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

/** GS1 mod-10 check digit for the digits before it. */
function gs1CheckDigit(body: string) {
  let sum = 0;
  // Weights alternate 3,1,3,... starting from the digit nearest the check digit.
  for (let i = body.length - 1, weight = 3; i >= 0; i -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(body[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export type BarcodeCheck = { ok: true } | { ok: false; reason: string };

/** Validates a UPC-A (12), EAN-13, EAN-8 or GTIN-14 code. */
export function checkBarcode(value: string | null | undefined): BarcodeCheck {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, reason: "Missing" };
  const code = normalizeBarcode(raw);
  if (code.length !== raw.replace(/[\s-]/g, "").length) return { ok: false, reason: "Contains letters or symbols" };
  if (!GTIN_LENGTHS.has(code.length)) {
    return { ok: false, reason: `${code.length} digits; UPC-A needs 12` };
  }
  const expected = gs1CheckDigit(code.slice(0, -1));
  if (expected !== Number(code[code.length - 1])) {
    return { ok: false, reason: `Check digit should be ${expected}` };
  }
  return { ok: true };
}

/**
 * Codes used by more than one distinct owner (SKU or record id).
 * Returns code → owners, only for codes that collide.
 */
export function findDuplicateBarcodes(rows: Array<{ owner: string; code: string | null | undefined }>) {
  const owners = new Map<string, Set<string>>();
  for (const row of rows) {
    const code = normalizeBarcode(row.code);
    if (!code) continue;
    const set = owners.get(code) ?? new Set<string>();
    set.add(row.owner);
    owners.set(code, set);
  }
  const duplicates = new Map<string, string[]>();
  for (const [code, set] of owners) if (set.size > 1) duplicates.set(code, [...set]);
  return duplicates;
}

export type BarcodeStatus = "missing" | "invalid" | "duplicate" | "mismatch" | "verified" | "unconfirmed";

export interface BarcodeAssessment {
  status: BarcodeStatus;
  label: string;
  detail: string;
  /** Problems block a factory order; "unconfirmed" only asks for a check. */
  isProblem: boolean;
}

const LABELS: Record<BarcodeStatus, string> = {
  missing: "UPC needed",
  invalid: "Bad code",
  duplicate: "Duplicate",
  mismatch: "Doesn't match book",
  verified: "GS1 verified",
  unconfirmed: "Confirm",
};

function assessment(status: BarcodeStatus, detail: string): BarcodeAssessment {
  return { status, label: LABELS[status], detail, isProblem: status !== "verified" && status !== "unconfirmed" };
}

/**
 * Judges one product's barcode.
 * - `bookCodes`: codes in the barcode book linked to this product (or its SKU).
 * - `duplicates`: output of findDuplicateBarcodes across all products.
 */
export function assessProductBarcode(
  code: string | null | undefined,
  bookCodes: string[],
  duplicates: Map<string, string[]>,
  owner: string,
): BarcodeAssessment {
  const normalized = normalizeBarcode(code);
  const book = bookCodes.map(normalizeBarcode).filter(Boolean);
  if (!normalized) {
    return book.length
      ? assessment("mismatch", `Shopify has no barcode; the barcode book says ${book[0]}.`)
      : assessment("missing", "No barcode on this product.");
  }
  const check = checkBarcode(normalized);
  if (!check.ok) return assessment("invalid", check.reason);
  const others = (duplicates.get(normalized) ?? []).filter((other) => other !== owner);
  if (others.length) return assessment("duplicate", `Also used by ${others.slice(0, 3).join(", ")}.`);
  if (book.length && !book.includes(normalized)) {
    return assessment("mismatch", `Barcode book says ${book[0]}.`);
  }
  if (book.includes(normalized)) return assessment("verified", "Matches the barcode book.");
  return assessment("unconfirmed", "From Shopify only. Check it against GS1 before printing.");
}

/**
 * Likely corrections for a code that fails the check: leading zeros that
 * spreadsheets drop, or the right check digit if only that is off. These are
 * guesses to confirm against GS1, never to apply blindly.
 */
export function suggestBarcodeRepairs(value: string | null | undefined) {
  const code = normalizeBarcode(value);
  if (!code || checkBarcode(code).ok) return [];
  const suggestions: Array<{ code: string; reason: string }> = [];
  for (let zeros = 1; code.length + zeros <= 13; zeros += 1) {
    const padded = "0".repeat(zeros) + code;
    if (GTIN_LENGTHS.has(padded.length) && checkBarcode(padded).ok) {
      suggestions.push({ code: padded, reason: `Adds ${zeros === 1 ? "a leading zero" : `${zeros} leading zeros`}, which spreadsheets often drop.` });
    }
  }
  if (GTIN_LENGTHS.has(code.length)) {
    const fixed = code.slice(0, -1) + gs1CheckDigit(code.slice(0, -1));
    suggestions.push({ code: fixed, reason: "Same first digits with the correct check digit." });
  }
  return suggestions;
}
