import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, listTable, upsertTable } from "@/services/baseService";
import type { FactoryShutdown, SupplyChainSettings } from "@/types/domain";
import { DEFAULT_LEAD_TIME_SETTINGS } from "@/utils/leadTime";

export const supplyChainService = {
  /** Returns the single settings row, creating it with defaults if migration seed is missing. */
  getSettings: async (): Promise<SupplyChainSettings> => {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("supply_chain_settings" as never)
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data as SupplyChainSettings;
    const [created] = (await upsertTable<SupplyChainSettings>("supply_chain_settings", {
      ...DEFAULT_LEAD_TIME_SETTINGS,
      packaging_reorder_pct: 20,
    })) as SupplyChainSettings[];
    return created;
  },
  saveSettings: async (payload: Partial<SupplyChainSettings>) => {
    const [saved] = (await upsertTable<SupplyChainSettings>("supply_chain_settings", payload)) as SupplyChainSettings[];
    return saved;
  },
  listShutdowns: () => listTable<FactoryShutdown>("factory_shutdowns", "start_date", true),
  saveShutdown: async (payload: Partial<FactoryShutdown>) => {
    const [saved] = (await upsertTable<FactoryShutdown>("factory_shutdowns", payload)) as FactoryShutdown[];
    return saved;
  },
  deleteShutdown: (id: string) => deleteFromTable("factory_shutdowns", id),
};
