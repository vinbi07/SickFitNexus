import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, deleteFromTableByIds, insertTable, listTable, updateTable, updateTableByIds, upsertTable } from "@/services/baseService";
import { applyCalculatedSafetyStock } from "@/services/productPlanningService";
import { getErrorMessage } from "@/utils/errors";
import type {
  AppSettings,
  Comment,
  GeneratedPurchaseOrderDocument,
  InventoryEvent,
  InventoryItem,
  InventoryReservation,
  Location,
  Person,
  PoLineItem,
  ProductBarcode,
  ProductBarcodeLink,
  Product,
  PurchaseOrder,
  Sop,
  TrainingModule,
  TrainingProgress,
  Vendor,
  Win,
} from "@/types/domain";
import { deriveInventoryAvailable, sortProductsByFamily } from "@/utils/lookbook";

function attachVariantRelations(products: Product[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const variantsByParentId = new Map<string, Product[]>();

  products.forEach((product) => {
    if (!product.parent_product_id) return;
    const current = variantsByParentId.get(product.parent_product_id) ?? [];
    current.push(product);
    variantsByParentId.set(product.parent_product_id, current);
  });

  return products.map((product) => ({
    ...product,
    parent_products: product.parent_product_id ? productsById.get(product.parent_product_id) ?? null : null,
    variants: (variantsByParentId.get(product.id) ?? []).sort(
      (left, right) => Number(left.variant_sort_order ?? 0) - Number(right.variant_sort_order ?? 0),
    ),
  }));
}

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
  const {
    vendors: _vendors,
    parent_products: _parentProducts,
    variants: _variants,
    product_barcode_links: _productBarcodeLinks,
    compliance_docs_required_input: _complianceDocsRequiredInput,
    starting_inventory: _startingInventory,
    ...productPayload
  } = payload as Partial<Product> & {
    compliance_docs_required_input?: string;
    starting_inventory?: number;
  };
  const isCreate = !productPayload.id;
  const startingInventory = Number(productPayload.current_inventory ?? 0);
  const [saved] = (await upsertTable<Product>("products", {
    ...productPayload,
    parent_product_id: productPayload.parent_product_id ? String(productPayload.parent_product_id) : null,
    variant_title: productPayload.variant_title ? String(productPayload.variant_title) : null,
    variant_sort_order: Number(productPayload.variant_sort_order ?? 0),
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

function normalizeBarcodeUpc(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // Preserve raw scientific-notation UPC strings so we do not invent digits the source file did not keep.
  return raw;
}

async function saveProductBarcode(payload: Partial<ProductBarcode>) {
  const {
    product_barcode_links: barcodeLinks,
    linked_product_ids: _linkedProductIds,
    ...barcodePayload
  } = payload as Partial<ProductBarcode> & { linked_product_ids?: string[] };

  try {
    const [saved] = (await upsertTable<ProductBarcode>("product_barcodes", {
      ...barcodePayload,
      sku: String(barcodePayload.sku ?? "").trim(),
      handle: barcodePayload.handle ? String(barcodePayload.handle).trim() : null,
      product_name: String(barcodePayload.product_name ?? "").trim(),
      collection: barcodePayload.collection ? String(barcodePayload.collection).trim() : null,
      pack_quantity:
        barcodePayload.pack_quantity === null || barcodePayload.pack_quantity === undefined || Number.isNaN(Number(barcodePayload.pack_quantity))
          ? null
          : Number(barcodePayload.pack_quantity),
      pack_unit: barcodePayload.pack_unit ? String(barcodePayload.pack_unit).trim() : null,
      size: barcodePayload.size ? String(barcodePayload.size).trim() : null,
      barcode_upc: normalizeBarcodeUpc(barcodePayload.barcode_upc),
    })) as ProductBarcode[];

    if (Array.isArray(barcodeLinks)) {
      const supabase = assertSupabase();
      const productIds = [...new Set(
        barcodeLinks
          .map((link) => String(link.product_id ?? "").trim())
          .filter(Boolean),
      )];

      const { error: deleteLinksError } = await supabase
        .from("product_barcode_links")
        .delete()
        .eq("barcode_id", saved.id);
      if (deleteLinksError) {
        console.error("Failed to clear existing barcode links", {
          barcodeId: saved.id,
          sku: saved.sku,
          productIds,
          error: deleteLinksError,
        });
        throw new Error(`Unable to save barcode links. ${getErrorMessage(deleteLinksError)}`);
      }

      if (productIds.length) {
        const { error: insertLinksError } = await supabase
          .from("product_barcode_links")
          .insert(productIds.map((productId) => ({ barcode_id: saved.id, product_id: productId })));
        if (insertLinksError) {
          console.error("Failed to insert barcode links", {
            barcodeId: saved.id,
            sku: saved.sku,
            productIds,
            error: insertLinksError,
          });
          throw new Error(`Unable to save linked products. ${getErrorMessage(insertLinksError)}`);
        }
      }
    }

    return saved;
  } catch (error) {
    console.error("Failed to save barcode row", {
      payload,
      error,
    });
    throw new Error(`Unable to save barcode row. ${getErrorMessage(error)}`);
  }
}

type ProductBarcodeImportRow = {
  sku?: string;
  handle?: string;
  product_name?: string;
  collection?: string;
  pack_quantity?: string | number;
  pack_unit?: string;
  size?: string;
  barcode_upc?: string | number;
};

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
        .select("*, vendors:vendors!products_vendor_id_fkey(*), product_barcode_links(*, product_barcodes(*))")
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
    return sortProductsByFamily(
      attachVariantRelations(
        calculated.map((product) => ({
          ...product,
          inventory_available: deriveInventoryAvailable(product),
        })),
      ),
    );
  },
  getProductDetail: async (id: string) => {
    const supabase = assertSupabase();
    const [productResponse, vendorsResponse, eventsResponse, reservationsResponse, lineItemsResponse, generatedDocsResponse] = await Promise.all([
      supabase
        .from("products")
        .select("*, vendors:vendors!products_vendor_id_fkey(*), product_barcode_links(*, product_barcodes(*))")
        .eq("id", id)
        .single(),
      supabase.from("vendors").select("*"),
      supabase.from("inventory_events").select("*").eq("product_id", id).order("event_date", { ascending: false }),
      supabase.from("inventory_reservations").select("*").eq("product_id", id).order("created_at", { ascending: false }),
      supabase.from("po_line_items").select("*, purchase_orders(*)").eq("product_id", id).order("created_at", { ascending: false }),
      supabase.from("generated_purchase_order_documents").select("*").order("created_at", { ascending: false }),
    ]);
    if (productResponse.error) throw productResponse.error;
    if (vendorsResponse.error) throw vendorsResponse.error;
    if (eventsResponse.error) throw eventsResponse.error;
    if (reservationsResponse.error) throw reservationsResponse.error;
    if (lineItemsResponse.error) throw lineItemsResponse.error;
    if (generatedDocsResponse.error) throw generatedDocsResponse.error;

    const calculated = applyCalculatedSafetyStock(
      [productResponse.data as Product],
      (vendorsResponse.data ?? []) as Vendor[],
      (eventsResponse.data ?? []) as InventoryEvent[],
    )[0];

    return {
      product: attachVariantRelations([
        {
          ...calculated,
          inventory_available: deriveInventoryAvailable(calculated),
        },
      ])[0],
      events: (eventsResponse.data ?? []) as InventoryEvent[],
      reservations: (reservationsResponse.data ?? []) as InventoryReservation[],
      poLineItems: (lineItemsResponse.data ?? []) as Array<PoLineItem & { purchase_orders?: PurchaseOrder | null }>,
      generatedDocuments: (generatedDocsResponse.data ?? []) as GeneratedPurchaseOrderDocument[],
    };
  },
  saveProduct,
  deleteProduct: (id: string) => deleteFromTable("products", id),
  bulkUpdateProducts: (ids: string[], patch: Partial<Product>) => updateTableByIds<Product>("products", ids, patch),
  deleteProducts: (ids: string[]) => deleteFromTableByIds("products", ids),
  listBarcodes: async () => {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("product_barcodes")
      .select("*, product_barcode_links(*, products(*))")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProductBarcode[];
  },
  saveBarcode: saveProductBarcode,
  deleteBarcode: (id: string) => deleteFromTable("product_barcodes", id),
  importBarcodes: async (rows: ProductBarcodeImportRow[]) => {
    const prepared = rows
      .map((row) => ({
        sku: String(row.sku ?? "").trim(),
        handle: row.handle ? String(row.handle).trim() : null,
        product_name: String(row.product_name ?? "").trim(),
        collection: row.collection ? String(row.collection).trim() : null,
        pack_quantity:
          row.pack_quantity === null || row.pack_quantity === undefined || String(row.pack_quantity).trim() === ""
            ? null
            : Number(row.pack_quantity),
        pack_unit: row.pack_unit ? String(row.pack_unit).trim() : null,
        size: row.size ? String(row.size).trim() : null,
        barcode_upc: normalizeBarcodeUpc(row.barcode_upc),
      }))
      .filter((row) => row.sku && row.product_name);

    if (!prepared.length) {
      throw new Error("No valid barcode rows were found in the CSV.");
    }

    const inserted = await insertTable<ProductBarcode>("product_barcodes", prepared);
    return {
      importedCount: (inserted ?? []).length,
    };
  },
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
