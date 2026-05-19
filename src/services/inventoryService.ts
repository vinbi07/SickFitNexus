import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, insertTable, listTable, upsertTable, updateTable } from "@/services/baseService";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import type { InventoryEvent, InventoryItem, Product, Vendor } from "@/types/domain";
import { deriveInventoryAvailable } from "@/utils/lookbook";

async function syncProductInventory(productId: string) {
  const supabase = assertSupabase();
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from("inventory_items")
    .select("quantity_on_hand")
    .eq("product_id", productId);
  if (inventoryError) throw inventoryError;
  const total = ((inventoryRows ?? []) as Array<{ quantity_on_hand: number | null }>).reduce(
    (sum: number, row: { quantity_on_hand: number | null }) => sum + Number(row.quantity_on_hand ?? 0),
    0,
  );
  const { data: product, error: productError } = await supabase.from("products").select("*").eq("id", productId).single();
  if (productError) throw productError;
  await updateTable<Product>("products", productId, {
    current_inventory: total,
    inventory_available: deriveInventoryAvailable({
      current_inventory: total,
      inventory_allocated: Number((product as Product).inventory_allocated ?? 0),
    }),
  });
}

export const inventoryService = {
  listProducts: () => listTable<Product>("products", "name", true),
  listItems: async () => {
    const supabase = assertSupabase();
    const [itemsResponse, vendorsResponse, eventsResponse] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("*, products:products!inventory_items_product_id_fkey(*, vendors:vendors!products_vendor_id_fkey(*)), locations:locations!inventory_items_location_id_fkey(*)")
        .order("updated_at", { ascending: false }),
      supabase.from("vendors").select("*"),
      supabase.from("inventory_events").select("*"),
    ]);
    if (itemsResponse.error) throw itemsResponse.error;
    if (vendorsResponse.error) throw vendorsResponse.error;
    if (eventsResponse.error) throw eventsResponse.error;

    const items = (itemsResponse.data ?? []) as InventoryItem[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const events = (eventsResponse.data ?? []) as InventoryEvent[];
    const products = items.map((item) => item.products).filter(Boolean) as Product[];
    const calculatedProducts = applyCalculatedSafetyStock(products, vendors, events);
    const calculatedById = new Map(calculatedProducts.map((product) => [product.id, product]));
    return items.map((item) => ({
      ...item,
      products: item.products
        ? {
            ...(calculatedById.get(item.products.id) ?? item.products),
            inventory_available: deriveInventoryAvailable(calculatedById.get(item.products.id) ?? item.products),
          }
        : item.products,
    }));
  },
  listEvents: async () => {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("inventory_events")
      .select("*, products:products!inventory_events_product_id_fkey(*), locations:locations!inventory_events_location_id_fkey(*)")
      .order("event_date", { ascending: false });
    if (error) throw error;
    return (data ?? []) as InventoryEvent[];
  },
  async saveItem(payload: Partial<InventoryItem>) {
    const { products: _products, locations: _locations, ...inventoryItemPayload } = payload;
    const [saved] = (await upsertTable<InventoryItem>("inventory_items", {
      inventory_category: "Core",
      ...inventoryItemPayload,
    })) as InventoryItem[];
    await syncProductInventory(saved.product_id);
    await activityService.create({
      event_type: saved.id === payload.id ? "inventory_item_updated" : "inventory_item_created",
      entity_type: "inventory_item",
      entity_id: saved.id,
      title: saved.id === payload.id ? "Inventory record updated" : "Inventory record created",
      description: `${saved.quantity_on_hand} units tracked for inventory item.`,
      metadata: { inventoryItemId: saved.id },
    });
    return saved;
  },
  async removeItem(id: string) {
    const supabase = assertSupabase();
    const { data: existing, error } = await supabase
      .from("inventory_items")
      .select("product_id")
      .eq("id", id)
      .single();
    if (error) throw error;
    await deleteFromTable("inventory_items", id);
    await syncProductInventory(existing.product_id as string);
    await activityService.create({
      event_type: "inventory_item_deleted",
      entity_type: "inventory_item",
      entity_id: id,
      title: "Inventory record deleted",
      description: "Inventory was removed from a location record.",
      metadata: { inventoryItemId: id },
    });
  },
  async createAdjustment(payload: Partial<InventoryEvent>) {
    const [created] = (await insertTable<InventoryEvent>("inventory_events", payload)) as InventoryEvent[];
    if (created.product_id) {
      const supabase = assertSupabase();
      const { data: inventoryItem, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("product_id", created.product_id)
        .eq("location_id", created.location_id)
        .single();
      if (error) throw error;
      await updateTable<InventoryItem>("inventory_items", inventoryItem.id as string, {
        quantity_on_hand: Number(inventoryItem.quantity_on_hand ?? 0) + Number(created.quantity_change ?? 0),
      });
      await syncProductInventory(created.product_id);
    }
    await activityService.create({
      event_type: "inventory_adjusted",
      entity_type: "inventory_event",
      entity_id: created.id,
      title: "Inventory adjusted",
      description: `${created.event_type} (${created.quantity_change})`,
      metadata: created as unknown as Record<string, unknown>,
    });
    return created;
  },
  async transferItem(payload: {
    inventoryItemId: string;
    targetLocationId: string;
    quantity: number;
    notes?: string;
    eventDate: string;
  }) {
    const supabase = assertSupabase();
    const { data: source, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", payload.inventoryItemId)
      .single();
    if (error) throw error;
    if (Number(source.quantity_on_hand ?? 0) < payload.quantity) {
      throw new Error("Transfer quantity cannot exceed the available on-hand inventory.");
    }

    const { data: target } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("product_id", source.product_id)
      .eq("location_id", payload.targetLocationId)
      .maybeSingle();

    await updateTable<InventoryItem>("inventory_items", source.id as string, {
      quantity_on_hand: Number(source.quantity_on_hand ?? 0) - payload.quantity,
    });

    let targetItemId = target?.id as string | undefined;
    if (targetItemId) {
      await updateTable<InventoryItem>("inventory_items", targetItemId, {
        quantity_on_hand: Number(target?.quantity_on_hand ?? 0) + payload.quantity,
      });
    } else {
      const [createdTarget] = (await upsertTable<InventoryItem>("inventory_items", {
        product_id: source.product_id,
        location_id: payload.targetLocationId,
        quantity_on_hand: payload.quantity,
        reorder_point: 0,
        target_stock: 0,
        inventory_category: source.inventory_category ?? "Core",
        notes: null,
      })) as InventoryItem[];
      targetItemId = createdTarget.id;
    }

    await insertTable<InventoryEvent>("inventory_events", [
      {
        product_id: source.product_id,
        location_id: source.location_id,
        event_type: "Transfer Out",
        quantity_change: payload.quantity * -1,
        event_date: payload.eventDate,
        notes: payload.notes ?? null,
      },
      {
        product_id: source.product_id,
        location_id: payload.targetLocationId,
        event_type: "Transfer In",
        quantity_change: payload.quantity,
        event_date: payload.eventDate,
        notes: payload.notes ?? null,
      },
    ]);

    await syncProductInventory(source.product_id as string);
    await activityService.create({
      event_type: "inventory_transferred",
      entity_type: "inventory_item",
      entity_id: targetItemId,
      title: "Inventory transferred",
      description: `${payload.quantity} units moved between locations.`,
      metadata: { sourceInventoryItemId: source.id, targetInventoryItemId: targetItemId },
    });
  },

  async allocateProducts(lines: Array<{ productId: string; units: number }>) {
    const supabase = assertSupabase();
    for (const line of lines) {
      const { data, error } = await supabase.from("products").select("*").eq("id", line.productId).single();
      if (error) throw error;
      const product = data as Product;
      const nextAllocated = Number(product.inventory_allocated ?? 0) + Number(line.units ?? 0);
      if (nextAllocated > Number(product.current_inventory ?? 0)) {
        throw new Error(`Allocation for ${product.name} exceeds on-hand inventory.`);
      }
      await updateTable<Product>("products", product.id, {
        inventory_allocated: nextAllocated,
        inventory_available: deriveInventoryAvailable({
          current_inventory: Number(product.current_inventory ?? 0),
          inventory_allocated: nextAllocated,
        }),
      });
    }
  },

  async releaseProducts(lines: Array<{ productId: string; units: number }>) {
    const supabase = assertSupabase();
    for (const line of lines) {
      const { data, error } = await supabase.from("products").select("*").eq("id", line.productId).single();
      if (error) throw error;
      const product = data as Product;
      const nextAllocated = Math.max(Number(product.inventory_allocated ?? 0) - Number(line.units ?? 0), 0);
      await updateTable<Product>("products", product.id, {
        inventory_allocated: nextAllocated,
        inventory_available: deriveInventoryAvailable({
          current_inventory: Number(product.current_inventory ?? 0),
          inventory_allocated: nextAllocated,
        }),
      });
    }
  },

  async fulfillProducts(lines: Array<{ productId: string; units: number; locationId?: string | null; relatedPoId?: string | null }>) {
    const supabase = assertSupabase();
    for (const line of lines) {
      const { data, error } = await supabase.from("products").select("*").eq("id", line.productId).single();
      if (error) throw error;
      const product = data as Product;
      const nextInventory = Math.max(Number(product.current_inventory ?? 0) - Number(line.units ?? 0), 0);
      const nextAllocated = Math.max(Number(product.inventory_allocated ?? 0) - Number(line.units ?? 0), 0);
      await updateTable<Product>("products", product.id, {
        current_inventory: nextInventory,
        inventory_allocated: nextAllocated,
        inventory_available: deriveInventoryAvailable({
          current_inventory: nextInventory,
          inventory_allocated: nextAllocated,
        }),
      });
      await insertTable<InventoryEvent>("inventory_events", {
        product_id: product.id,
        location_id: line.locationId ?? null,
        related_po_id: line.relatedPoId ?? null,
        event_type: "Usage",
        quantity_change: Number(line.units ?? 0) * -1,
        event_date: new Date().toISOString().slice(0, 10),
        notes: "Fulfilled lookbook order allocation.",
      });
    }
  },
};
