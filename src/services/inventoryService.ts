import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { insertTable, listTable, updateTable } from "@/services/baseService";
import type { InventoryEvent, Product } from "@/types/domain";

export const inventoryService = {
  listProducts: () => listTable<Product>("products", "name", true),
  listEvents: async () => {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("inventory_events")
      .select("*, products(*), locations(*)")
      .order("event_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as InventoryEvent[];
  },
  async createAdjustment(payload: Partial<InventoryEvent>) {
    const [created] = (await insertTable<InventoryEvent>("inventory_events", payload)) as InventoryEvent[];
    if (created.product_id) {
      const supabase = assertSupabase();
      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", created.product_id)
        .single();
      if (error) throw error;
      await updateTable<Product>("products", created.product_id, {
        current_inventory: (product.current_inventory ?? 0) + created.quantity_change,
      });
    }
    await activityService.create({
      event_type: "inventory_adjusted",
      entity_type: "inventory_event",
      entity_id: created.id,
      title: "Inventory adjusted",
      description: `${created.event_type} (${created.quantity_change})`,
      metadata: created,
    });
    return created;
  },
};
