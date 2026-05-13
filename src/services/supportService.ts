import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, listTable, updateTable, upsertTable } from "@/services/baseService";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import type {
  AppSettings,
  Comment,
  InventoryEvent,
  InventoryItem,
  Location,
  Person,
  Product,
  Sop,
  TrainingModule,
  TrainingProgress,
  Vendor,
  Win,
} from "@/types/domain";

function upsertSingle<T>(table: string) {
  return async (payload: Partial<T>) => {
    const [saved] = (await upsertTable<T>(table, payload)) as T[];
    return saved;
  };
}

async function getOrCreateDefaultLocation() {
  const supabase = assertSupabase();
  const { data: existingLocations, error: existingLocationsError } = await supabase
    .from("locations")
    .select("*")
    .order("name", { ascending: true })
    .limit(1);
  if (existingLocationsError) throw existingLocationsError;

  const location = (existingLocations ?? [])[0] as Location | undefined;
  if (location) return location;

  const [createdLocation] = (await upsertTable<Location>("locations", {
    name: "Default Warehouse",
    type: "Warehouse",
    address: null,
  })) as Location[];
  return createdLocation;
}

async function saveProduct(payload: Partial<Product>) {
  const { vendors: _vendors, ...productPayload } = payload;
  const isCreate = !productPayload.id;
  const startingInventory = Number(productPayload.current_inventory ?? 0);
  const [saved] = (await upsertTable<Product>("products", {
    ...productPayload,
    current_inventory: isCreate ? 0 : productPayload.current_inventory,
  })) as Product[];

  if (isCreate && startingInventory > 0) {
    const defaultLocation = await getOrCreateDefaultLocation();
    await upsertTable<InventoryItem>("inventory_items", {
      product_id: saved.id,
      location_id: defaultLocation.id,
      quantity_on_hand: startingInventory,
      reorder_point: 0,
      target_stock: 0,
      notes: "Created automatically from product starting inventory.",
    });
    await updateTable<Product>("products", saved.id, {
      current_inventory: startingInventory,
    });
    return {
      ...saved,
      current_inventory: startingInventory,
    } as Product;
  }

  return saved;
}

export const supportService = {
  listLocations: async () => {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("locations")
      .select("*, retailers(*)")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Location[];
  },
  saveLocation: upsertSingle<Location>("locations"),
  deleteLocation: (id: string) => deleteFromTable("locations", id),
  listProducts: async () => {
    const supabase = assertSupabase();
    const [productsResponse, vendorsResponse, eventsResponse] = await Promise.all([
      supabase
        .from("products")
        .select("*, vendors:vendors!products_vendor_id_fkey(*)")
        .order("name", { ascending: true }),
      supabase.from("vendors").select("*"),
      supabase.from("inventory_events").select("*"),
    ]);

    if (productsResponse.error) throw productsResponse.error;
    if (vendorsResponse.error) throw vendorsResponse.error;
    if (eventsResponse.error) throw eventsResponse.error;

    const products = (productsResponse.data ?? []) as Product[];
    const vendors = (vendorsResponse.data ?? []) as Vendor[];
    const events = (eventsResponse.data ?? []) as InventoryEvent[];
    const calculated = applyCalculatedSafetyStock(
      products,
      vendors,
      events,
    );
    return calculated;
  },
  saveProduct,
  deleteProduct: (id: string) => deleteFromTable("products", id),
  listSops: () => listTable<Sop>("sops"),
  saveSop: upsertSingle<Sop>("sops"),
  deleteSop: (id: string) => deleteFromTable("sops", id),
  listComments: () => listTable<Comment>("comments"),
  saveComment: upsertSingle<Comment>("comments"),
  listWins: () => listTable<Win>("wins"),
  saveWin: upsertSingle<Win>("wins"),
  deleteWin: (id: string) => deleteFromTable("wins", id),
  listPeople: () => listTable<Person>("people", "name", true),
  savePerson: upsertSingle<Person>("people"),
  deletePerson: (id: string) => deleteFromTable("people", id),
  listTrainingModules: () => listTable<TrainingModule>("training_modules", "sort_order", true),
  saveTrainingModule: upsertSingle<TrainingModule>("training_modules"),
  listTrainingProgress: () => listTable<TrainingProgress>("training_progress"),
  saveTrainingProgress: upsertSingle<TrainingProgress>("training_progress"),
  listSettings: () => listTable<AppSettings>("app_settings"),
  saveSettings: upsertSingle<AppSettings>("app_settings"),
};
