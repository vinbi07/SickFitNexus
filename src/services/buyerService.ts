import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import type { Buyer } from "@/types/domain";
import { addDays, toDateInput } from "@/utils/date";

function normalizeBuyer(payload: Partial<Buyer>) {
  const { retailers: _retailers, lookbook_templates: _lookbookTemplate, ...buyerPayload } = payload;
  return {
    ...buyerPayload,
    phone: payload.phone ? String(payload.phone) : null,
    billing_address: payload.billing_address ? String(payload.billing_address) : null,
    shipping_address: payload.shipping_address ? String(payload.shipping_address) : null,
    payment_terms: payload.payment_terms ? String(payload.payment_terms) : null,
    compliance_requirements: payload.compliance_requirements ? String(payload.compliance_requirements) : null,
    assigned_sales_rep: payload.assigned_sales_rep ? String(payload.assigned_sales_rep) : null,
    lookbook_template_id: payload.lookbook_template_id ? String(payload.lookbook_template_id) : null,
    lookbook_status: (payload.lookbook_status === "ready" ? "ready" : "draft") as Buyer["lookbook_status"],
    link_validity_days:
      buyerPayload.link_validity_days === null || buyerPayload.link_validity_days === undefined
        ? 30
        : Number(buyerPayload.link_validity_days),
    token_expires_at: payload.token_expires_at ? String(payload.token_expires_at) : null,
    last_accessed_at: payload.last_accessed_at ? String(payload.last_accessed_at) : null,
    order_mode_enabled: Boolean(payload.order_mode_enabled),
  };
}

export const buyerService = {
  async list(retailerId?: string) {
    const supabase = assertSupabase();
    let query = supabase.from("buyers").select("*, retailers(*), lookbook_templates(*)").order("buyer_name", { ascending: true });
    if (retailerId) query = query.eq("retailer_id", retailerId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Buyer[];
  },

  async upsert(payload: Partial<Buyer>) {
    const normalized = normalizeBuyer(payload);
    const requestedValidityDays = Number(normalized.link_validity_days ?? 30);

    if (!normalized.id) {
      normalized.token_expires_at = toDateInput(addDays(new Date(), requestedValidityDays));
    } else {
      const supabase = assertSupabase();
      const { data: existing, error: existingError } = await supabase
        .from("buyers")
        .select("link_validity_days, token_expires_at")
        .eq("id", normalized.id)
        .single();
      if (existingError) throw existingError;

      const existingValidityDays = Number(existing?.link_validity_days ?? 30);
      normalized.token_expires_at =
        existingValidityDays === requestedValidityDays
          ? (existing?.token_expires_at ?? toDateInput(addDays(new Date(), requestedValidityDays)))
          : toDateInput(addDays(new Date(), requestedValidityDays));
    }

    const [saved] = (await upsertTable<Buyer>("buyers", normalized)) as Buyer[];
    return saved;
  },

  remove: (id: string) => deleteFromTable("buyers", id),

  async getById(id: string) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("buyers")
      .select("*, retailers(*), lookbook_templates(*)")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as Buyer;
  },

  async getByToken(token: string) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("buyers")
      .select("*, retailers(*), lookbook_templates(*)")
      .eq("access_token", token)
      .single();
    if (error) throw error;

    const buyer = data as Buyer;
    if (buyer.token_expires_at && new Date(buyer.token_expires_at).getTime() < Date.now()) {
      throw new Error("This ordering link has expired.");
    }

    await supabase.from("buyers").update({ last_accessed_at: new Date().toISOString() }).eq("id", buyer.id);
    return buyer;
  },

  validateProfile(buyer: Partial<Buyer>) {
    if (!buyer.retailer_id) throw new Error("Buyer must be assigned to a retailer account.");
    if (!String(buyer.company_name ?? "").trim()) throw new Error("Buyer company name is required.");
    if (!String(buyer.buyer_name ?? "").trim()) throw new Error("Buyer name is required.");
    if (!String(buyer.buyer_email ?? "").trim()) throw new Error("Buyer email is required.");
    if (!buyer.shipping_address) throw new Error("Shipping address is required before submitting a PO.");
    if (!buyer.billing_address) throw new Error("Billing address is required before submitting a PO.");
  },
};
