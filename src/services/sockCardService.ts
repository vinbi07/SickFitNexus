import { assertSupabase } from "@/lib/supabase";
import { insertTable, upsertTable } from "@/services/baseService";
import type { Alert, PoLineItem, SockCard, SockCardTxn } from "@/types/domain";

export type CardDrawEntry = {
  sockCardId: string;
  cardName: string;
  cardsUsed: number;
  onHand: number;
  remaining: number;
  status: "ok" | "low" | "short";
};

export function calculateCardsUsed(quantityOrdered: number, packPairs: number): number {
  if (!packPairs || packPairs <= 0) return 0;
  return Math.ceil(Number(quantityOrdered || 0) / Number(packPairs));
}

export const sockCardService = {
  async listCards(): Promise<SockCard[]> {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("sock_cards")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SockCard[];
  },

  calculateCardDraw(
    lineItems: Array<Partial<PoLineItem>>,
    sockCards: SockCard[],
  ): CardDrawEntry[] {
    const cardById = new Map(sockCards.map((card) => [card.id, card]));
    const usedByCardId = new Map<string, number>();

    for (const line of lineItems) {
      if (!line.sock_card_id) continue;
      const cards = calculateCardsUsed(
        Number(line.quantity_ordered ?? 0),
        Number(line.pack_pairs ?? 1),
      );
      usedByCardId.set(line.sock_card_id, (usedByCardId.get(line.sock_card_id) ?? 0) + cards);
    }

    return [...usedByCardId.entries()].map(([cardId, cardsUsed]) => {
      const card = cardById.get(cardId);
      const onHand = card?.on_hand ?? 0;
      const remaining = onHand - cardsUsed;
      const reorderPoint = card?.reorder_point ?? 2500;
      let status: CardDrawEntry["status"] = "ok";
      if (remaining < 0) status = "short";
      else if (remaining <= reorderPoint) status = "low";
      return {
        sockCardId: cardId,
        cardName: card?.name ?? cardId,
        cardsUsed,
        onHand,
        remaining,
        status,
      };
    });
  },

  validateAvailability(
    lineItems: Array<Partial<PoLineItem>>,
    sockCards: SockCard[],
  ): Array<{ cardId: string; cardName: string; needed: number; onHand: number }> {
    const draw = sockCardService.calculateCardDraw(lineItems, sockCards);
    return draw
      .filter((entry) => entry.status === "short")
      .map((entry) => ({
        cardId: entry.sockCardId,
        cardName: entry.cardName,
        needed: entry.cardsUsed,
        onHand: entry.onHand,
      }));
  },

  async confirmDraw(
    purchaseOrderId: string,
    lineItems: PoLineItem[],
    actorLabel?: string | null,
  ): Promise<void> {
    const supabase = assertSupabase();

    for (const item of lineItems) {
      if (!item.sock_card_id) continue;
      const cardsUsed = calculateCardsUsed(
        Number(item.quantity_ordered ?? 0),
        Number(item.pack_pairs ?? 1),
      );
      if (cardsUsed <= 0) continue;

      // Write ledger row
      await insertTable<SockCardTxn>("sock_card_txns", {
        sock_card_id: item.sock_card_id,
        purchase_order_id: purchaseOrderId,
        po_line_item_id: item.id,
        quantity_change: -cardsUsed,
        cards_used: cardsUsed,
        txn_type: "order_confirmed",
        notes: actorLabel ? `Confirmed by ${actorLabel}` : null,
      });

      // Decrement on_hand
      const { data: current, error: readError } = await supabase
        .from("sock_cards")
        .select("on_hand, reorder_point, name")
        .eq("id", item.sock_card_id)
        .single();
      if (readError) throw readError;

      const card = current as { on_hand: number; reorder_point: number; name: string };
      const newOnHand = card.on_hand - cardsUsed;

      const { error: updateError } = await supabase
        .from("sock_cards")
        .update({ on_hand: newOnHand, updated_at: new Date().toISOString() })
        .eq("id", item.sock_card_id);
      if (updateError) throw updateError;

      // Create alert if at or below reorder point
      if (newOnHand <= card.reorder_point) {
        await insertTable<Alert>("alerts", {
          alert_type: "Low Card Stock",
          severity: newOnHand <= 0 ? "Critical" : "High",
          message: newOnHand <= 0
            ? `Sock card "${card.name}" is out of stock (0 remaining).`
            : `Sock card "${card.name}" is at or below reorder point (${newOnHand} remaining, threshold ${card.reorder_point}).`,
          related_entity_type: "sock_card",
          related_entity_id: item.sock_card_id,
          is_resolved: false,
        });
      }
    }
  },
};
