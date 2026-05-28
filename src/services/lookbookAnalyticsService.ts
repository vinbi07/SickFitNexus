import { assertSupabase } from "@/lib/supabase";
import { insertTable } from "@/services/baseService";
import type { Buyer, LookbookView, Retailer } from "@/types/domain";

function buildSessionLabel() {
  if (typeof navigator === "undefined") return "server";
  return navigator.userAgent.slice(0, 80);
}

export const lookbookAnalyticsService = {
  async trackEvent(input: {
    buyer: Buyer;
    retailer: Retailer;
    eventType: LookbookView["event_type"];
    metadata?: Record<string, unknown>;
  }) {
    await insertTable<LookbookView>("lookbook_views", {
      buyer_id: input.buyer.id,
      retailer_id: input.retailer.id,
      access_token: input.buyer.access_token,
      event_type: input.eventType,
      session_label: buildSessionLabel(),
      metadata: input.metadata ?? {},
    });

    const supabase = assertSupabase();
    await supabase.from("buyers").update({ last_accessed_at: new Date().toISOString() }).eq("id", input.buyer.id);
  },
};
