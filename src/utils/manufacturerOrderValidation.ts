import type { PoLineItem, ProductBarcode, SockCard } from "@/types/domain";
import { calculateCardsUsed } from "@/services/sockCardService";
import { checkBarcode, normalizeBarcode } from "@/utils/barcode";

export type ManufacturerOrderIssue = {
  lineIndex?: number;
  severity: "stop" | "warning";
  message: string;
};

/**
 * Checks a manufacturer order before it goes to the factory. Pass the barcode
 * book to also confirm each UPC against the GS1 codes on file; a wrong code
 * means a reprint or a retailer rejecting the shipment.
 */
export function validateManufacturerOrder(
  lineItems: Array<Partial<PoLineItem>>,
  sockCards: SockCard[],
  barcodeBook: ProductBarcode[] = [],
): ManufacturerOrderIssue[] {
  const issues: ManufacturerOrderIssue[] = [];
  const bookByCode = new Map<string, ProductBarcode>();
  for (const row of barcodeBook) {
    const code = normalizeBarcode(row.barcode_upc);
    if (code && !bookByCode.has(code)) bookByCode.set(code, row);
  }
  // code → lines using it, to catch one barcode printed on two different designs
  const linesByCode = new Map<string, number[]>();
  const cardById = new Map(sockCards.map((c) => [c.id, c]));
  const usedByCardId = new Map<string, number>();

  lineItems.forEach((line, index) => {
    if (!String(line.product_name ?? "").trim()) {
      issues.push({ lineIndex: index, severity: "stop", message: "Design name is required." });
    }

    if (Number(line.quantity_ordered ?? 0) <= 0) {
      issues.push({ lineIndex: index, severity: "stop", message: "Pairs ordered must be greater than zero." });
    }

    if (!line.sock_card_id) {
      issues.push({ lineIndex: index, severity: "stop", message: "Sock card is required." });
    }

    if (line.art_status === "NEEDED") {
      issues.push({ lineIndex: index, severity: "stop", message: "Art status is NEEDED — stop production." });
    }

    if (line.barcode_required && !String(line.upc ?? "").trim()) {
      issues.push({ lineIndex: index, severity: "stop", message: "Barcode is required but missing." });
    }

    const code = normalizeBarcode(line.upc);
    if (String(line.upc ?? "").trim()) {
      const check = checkBarcode(line.upc);
      if (!check.ok) {
        issues.push({ lineIndex: index, severity: "stop", message: `Barcode ${line.upc}: ${check.reason}.` });
      } else {
        linesByCode.set(code, [...(linesByCode.get(code) ?? []), index]);
        const book = bookByCode.get(code);
        if (barcodeBook.length && !book) {
          issues.push({
            lineIndex: index,
            severity: "warning",
            message: `Barcode ${code} is not in the barcode book. Confirm it against GS1 before printing.`,
          });
        } else if (book && line.sku && book.sku.trim().toUpperCase() !== String(line.sku).trim().toUpperCase()) {
          issues.push({
            lineIndex: index,
            severity: "warning",
            message: `Barcode ${code} belongs to ${book.sku} in the barcode book.`,
          });
        }
      }
    }

    const qty = Number(line.quantity_ordered ?? 0);
    const pack = Number(line.pack_pairs ?? 1);
    if (pack > 0 && qty > 0 && qty % pack !== 0) {
      issues.push({
        lineIndex: index,
        severity: "warning",
        message: `${qty} pairs is not a clean multiple of ${pack}. Cards will round up.`,
      });
    }

    // Accumulate card draw for shortage check
    if (line.sock_card_id && qty > 0 && pack > 0) {
      const cards = calculateCardsUsed(qty, pack);
      usedByCardId.set(line.sock_card_id, (usedByCardId.get(line.sock_card_id) ?? 0) + cards);
    }
  });

  for (const [code, indexes] of linesByCode) {
    const designs = new Set(indexes.map((i) => String(lineItems[i].sku || lineItems[i].product_name || i).trim().toUpperCase()));
    if (designs.size > 1) {
      issues.push({
        severity: "stop",
        message: `Barcode ${code} is on lines ${indexes.map((i) => i + 1).join(" and ")}. Each design needs its own code.`,
      });
    }
  }

  // Card shortage stops — check after accumulating all lines
  for (const [cardId, totalUsed] of usedByCardId) {
    const card = cardById.get(cardId);
    if (!card) continue;
    if (totalUsed > card.on_hand) {
      issues.push({
        severity: "stop",
        message: `Card shortage: "${card.name}" needs ${totalUsed} but only ${card.on_hand} on hand.`,
      });
    }
  }

  return issues;
}

export function hasStopIssues(issues: ManufacturerOrderIssue[]): boolean {
  return issues.some((issue) => issue.severity === "stop");
}
