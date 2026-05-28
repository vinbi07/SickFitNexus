import { assertSupabase } from "@/lib/supabase";
import { insertTable, upsertTable } from "@/services/baseService";
import { dashboardSessionService } from "@/services/dashboardSessionService";
import type {
  InboundIntakeAttachment,
  InboundIntakeRequest,
  PurchaseOrder,
  Retailer,
} from "@/types/domain";

async function requireActor() {
  const user = await dashboardSessionService.requireCurrentUser();
  return {
    created_by_user_id: user.id,
    created_by_label: user.display_name || user.email,
  };
}

export const intakeService = {
  async list() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("inbound_intake_requests")
      .select("*, inbound_intake_attachments(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Array<InboundIntakeRequest & { inbound_intake_attachments?: InboundIntakeAttachment[] }>;
  },

  async create(payload: Partial<InboundIntakeRequest>, attachmentUrls: Array<{ title: string; file_url?: string | null }> = []) {
    const actor = await requireActor();
    const [saved] = (await insertTable<InboundIntakeRequest>("inbound_intake_requests", {
      ...payload,
      ...actor,
    })) as InboundIntakeRequest[];

    if (attachmentUrls.length) {
      await insertTable<InboundIntakeAttachment>(
        "inbound_intake_attachments",
        attachmentUrls.map((attachment) => ({
          intake_request_id: saved.id,
          title: attachment.title,
          file_url: attachment.file_url ?? null,
        })),
      );
    }
    return saved;
  },

  async update(payload: Partial<InboundIntakeRequest>) {
    const [saved] = (await upsertTable<InboundIntakeRequest>("inbound_intake_requests", payload)) as InboundIntakeRequest[];
    return saved;
  },

  async convertToRetailerOrPo(input: {
    intakeRequestId: string;
    retailer?: Partial<Retailer> | null;
    purchaseOrder?: Partial<PurchaseOrder> | null;
  }) {
    const supabase = assertSupabase();
    const actor = await requireActor();

    let savedRetailerId: string | null = null;
    if (input.retailer) {
      const { data, error } = await supabase.from("retailers").upsert(input.retailer).select("id").single();
      if (error) throw error;
      savedRetailerId = (data as { id: string }).id;
    }

    let savedPoId: string | null = null;
    if (input.purchaseOrder) {
      const { data, error } = await supabase.from("purchase_orders").upsert(input.purchaseOrder).select("id").single();
      if (error) throw error;
      savedPoId = (data as { id: string }).id;
    }

    const [saved] = (await upsertTable<InboundIntakeRequest>("inbound_intake_requests", {
      id: input.intakeRequestId,
      status: "Converted",
      converted_retailer_id: savedRetailerId,
      converted_purchase_order_id: savedPoId,
      ...actor,
    })) as InboundIntakeRequest[];

    return saved;
  },
};
