import { assertSupabase } from "@/lib/supabase";
import { upsertTable } from "@/services/baseService";
import type { CapacitySnapshot } from "@/types/domain";

export const capacityService = {
  async list() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("capacity_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CapacitySnapshot[];
  },

  async upsert(payload: Partial<CapacitySnapshot>) {
    const [saved] = (await upsertTable<CapacitySnapshot>("capacity_snapshots", payload)) as CapacitySnapshot[];
    return saved;
  },
};
