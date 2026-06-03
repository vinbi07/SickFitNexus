import type { PoLineItem, SockCard } from "@/types/domain";
import { calculateCardsUsed } from "@/services/sockCardService";

export type ManufacturerOrderIssue = {
  lineIndex?: number;
  severity: "stop" | "warning";
  message: string;
};

export function validateManufacturerOrder(
  lineItems: Array<Partial<PoLineItem>>,
  sockCards: SockCard[],
): ManufacturerOrderIssue[] {
  const issues: ManufacturerOrderIssue[] = [];
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
