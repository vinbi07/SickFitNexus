/**
 * Reads the net days out of free-form payment terms, e.g. "NT30 Net due in 30 days",
 * "Net 30", "N45". Returns null when no net period can be found.
 */
export function parseNetDays(terms: string | null | undefined): number | null {
  const text = String(terms ?? "").toUpperCase();
  if (!text.trim()) return null;
  const match = text.match(/\bN(?:ET|T)?\s*-?\s*(\d{1,3})\b/) ?? text.match(/\b(\d{1,3})\s*DAYS?\b/);
  if (!match) return null;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : null;
}

/** Adds days to a YYYY-MM-DD date without timezone drift. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/** Short label for the invoice, e.g. "Net 30". Falls back to the raw terms. */
export function formatTermsLabel(terms: string | null | undefined): string {
  const days = parseNetDays(terms);
  if (days) return `Net ${days}`;
  return String(terms ?? "").trim();
}

export function computeDueDate(invoiceDate: string | null | undefined, terms: string | null | undefined): string | null {
  if (!invoiceDate) return null;
  const days = parseNetDays(terms);
  return days ? addDaysToIsoDate(invoiceDate, days) : null;
}
