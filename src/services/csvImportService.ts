import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { deleteFromTable, insertTable, updateTable } from "@/services/baseService";
import type {
  CsvImport,
  CsvImportEntityLink,
  CsvImportError,
  InventoryItem,
  MappingPreset,
  Location,
  NormalizedImportRow,
  Product,
  PurchaseOrder,
  Vendor,
} from "@/types/domain";
import { inferMapping, normalizeRows, parseCsvFile, validateNormalizedRows } from "@/utils/csv";

const importResetPassword = import.meta.env.VITE_IMPORT_RESET_PASSWORD ?? "reset-imports";

async function recordImportLink(payload: Partial<CsvImportEntityLink>) {
  const [created] = (await insertTable<CsvImportEntityLink>("csv_import_entity_links", payload)) as CsvImportEntityLink[];
  return created;
}

async function findOrCreateVendor(name: string, csvImportId?: string) {
  const supabase = assertSupabase();
  const { data: existing } = await supabase.from("vendors").select("*").ilike("name", name).limit(1).maybeSingle();
  if (existing) return existing as Vendor;
  const { data, error } = await supabase.from("vendors").insert({ name }).select().single();
  if (error) throw error;
  const vendor = data as Vendor;
  if (csvImportId) {
    await recordImportLink({
      csv_import_id: csvImportId,
      entity_type: "vendor",
      entity_id: vendor.id,
      action_type: "created",
      previous_data: null,
    });
  }
  return vendor;
}

async function findOrCreateLocation(name: string, csvImportId?: string) {
  const supabase = assertSupabase();
  const { data: existing } = await supabase.from("locations").select("*").ilike("name", name).limit(1).maybeSingle();
  if (existing) return existing as Location;
  const { data, error } = await supabase.from("locations").insert({ name, type: "Warehouse" }).select().single();
  if (error) throw error;
  const location = data as Location;
  if (csvImportId) {
    await recordImportLink({
      csv_import_id: csvImportId,
      entity_type: "location",
      entity_id: location.id,
      action_type: "created",
      previous_data: null,
    });
  }
  return location;
}

async function findOrCreateProduct(row: NormalizedImportRow, csvImportId?: string) {
  const supabase = assertSupabase();
  const { data: existing } = await supabase.from("products").select("*").eq("sku", row.sku).maybeSingle();
  if (existing) return existing as Product;
  const { data, error } = await supabase
    .from("products")
    .insert({
      sku: row.sku,
      name: row.product_name,
      unit_cost: row.unit_cost,
      safety_stock: 25,
    })
    .select()
    .single();
  if (error) throw error;
  const product = data as Product;
  if (csvImportId) {
    await recordImportLink({
      csv_import_id: csvImportId,
      entity_type: "product",
      entity_id: product.id,
      action_type: "created",
      previous_data: null,
    });
  }
  return product;
}

async function findDuplicate(row: NormalizedImportRow, vendorId: string) {
  const supabase = assertSupabase();
  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("po_number", row.po_number)
    .eq("vendor_id", vendorId)
    .eq("order_date", row.order_date)
    .maybeSingle();
  if (!po) return false;
  const { data: lineItem } = await supabase
    .from("po_line_items")
    .select("id")
    .eq("purchase_order_id", po.id)
    .eq("sku", row.sku)
    .eq("product_name", row.product_name)
    .maybeSingle();
  return Boolean(lineItem);
}

async function syncAllProductInventoryFromItems() {
  const supabase = assertSupabase();
  const [{ data: products, error: productsError }, { data: inventoryItems, error: inventoryItemsError }] = await Promise.all([
    supabase.from("products").select("id"),
    supabase.from("inventory_items").select("product_id, quantity_on_hand"),
  ]);
  if (productsError) throw productsError;
  if (inventoryItemsError) throw inventoryItemsError;

  const totals = new Map<string, number>();
  ((inventoryItems ?? []) as Array<{ product_id: string; quantity_on_hand: number | null }>).forEach((item) => {
    totals.set(item.product_id, (totals.get(item.product_id) ?? 0) + Number(item.quantity_on_hand ?? 0));
  });

  await Promise.all(
    ((products ?? []) as Array<{ id: string }>).map((product) =>
      updateTable<Product>("products", product.id, {
        current_inventory: totals.get(product.id) ?? 0,
      }),
    ),
  );
}

async function syncProductInventoryFromItems(productId: string) {
  const supabase = assertSupabase();
  const { data: inventoryItems, error: inventoryItemsError } = await supabase
    .from("inventory_items")
    .select("quantity_on_hand")
    .eq("product_id", productId);
  if (inventoryItemsError) throw inventoryItemsError;

  const total = ((inventoryItems ?? []) as Array<{ quantity_on_hand: number | null }>).reduce(
    (sum, item) => sum + Number(item.quantity_on_hand ?? 0),
    0,
  );
  await updateTable<Product>("products", productId, { current_inventory: total });
}

function getTableForEntityType(entityType: string) {
  switch (entityType) {
    case "vendor":
      return "vendors";
    case "location":
      return "locations";
    case "product":
      return "products";
    case "purchase_order":
      return "purchase_orders";
    case "po_line_item":
      return "po_line_items";
    case "inventory_event":
      return "inventory_events";
    case "inventory_item":
      return "inventory_items";
    default:
      throw new Error(`Unsupported import lineage entity type: ${entityType}`);
  }
}

export const csvImportService = {
  parseCsvFile,
  inferMapping,
  normalizeRows,
  validateNormalizedRows,

  async listImports() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("csv_imports")
      .select("*, vendors(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as CsvImport[];
  },

  async listImportErrors(importId: string) {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("csv_import_errors")
      .select("*")
      .eq("csv_import_id", importId)
      .order("row_number", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CsvImportError[];
  },

  async listPresets() {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from("mapping_presets").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as MappingPreset[];
  },

  async savePreset(payload: Partial<MappingPreset>) {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from("mapping_presets").upsert(payload).select().single();
    if (error) throw error;
    return data as MappingPreset;
  },

  async importRows(fileName: string, mapping: Record<string, string>, rows: Record<string, string>[]) {
    const normalizedRows = normalizeRows(rows, mapping);
    const validationErrors = validateNormalizedRows(normalizedRows);

    const [csvImport] = (await insertTable<CsvImport>("csv_imports", {
      file_name: fileName,
      row_count: rows.length,
      successful_rows: 0,
      failed_rows: validationErrors.length,
      mapping_config: mapping,
      import_status: validationErrors.length ? "Partial" : "Validated",
    })) as CsvImport[];

    if (validationErrors.length) {
      await insertTable<CsvImportError>(
        "csv_import_errors",
        validationErrors.map((error) => ({
          csv_import_id: csvImport.id,
          row_number: error.rowNumber,
          error_message: error.errorMessage,
          raw_row: rows[error.rowNumber - 2],
        })),
      );
    }

    let successfulRows = 0;
    let failedRows = validationErrors.length;
    const restoredEntities = new Set<string>();

    for (const [index, row] of normalizedRows.entries()) {
      try {
        if (validationErrors.some((error) => error.rowNumber === index + 2)) continue;
        const vendor = await findOrCreateVendor(row.vendor_name, csvImport.id);
        const location = await findOrCreateLocation(row.location_name || "Main Warehouse", csvImport.id);
        const product = await findOrCreateProduct(row, csvImport.id);

        if (await findDuplicate(row, vendor.id)) {
          failedRows += 1;
          await insertTable<CsvImportError>("csv_import_errors", {
            csv_import_id: csvImport.id,
            row_number: index + 2,
            error_message: "Duplicate PO line item detected",
            raw_row: rows[index],
          });
          continue;
        }

        const supabase = assertSupabase();
        const { data: poExisting } = await supabase
          .from("purchase_orders")
          .select("*")
          .eq("po_number", row.po_number)
          .eq("vendor_id", vendor.id)
          .maybeSingle();

        let purchaseOrder = poExisting as PurchaseOrder | null;
        if (!purchaseOrder) {
          const { data, error } = await supabase
            .from("purchase_orders")
            .insert({
              po_number: row.po_number,
              vendor_id: vendor.id,
              location_id: location.id,
              status: row.status,
              order_date: row.order_date,
              expected_delivery_date: row.expected_delivery_date,
              actual_delivery_date: row.actual_delivery_date,
              total_cost: row.quantity_ordered * row.unit_cost,
              source_file_name: fileName,
              notes: row.notes,
            })
            .select()
            .single();
          if (error) throw error;
          purchaseOrder = data as PurchaseOrder;
          await recordImportLink({
            csv_import_id: csvImport.id,
            entity_type: "purchase_order",
            entity_id: purchaseOrder.id,
            action_type: "created",
            previous_data: null,
          });
        } else {
          const restoreKey = `purchase_order:${purchaseOrder.id}`;
          if (!restoredEntities.has(restoreKey)) {
            await recordImportLink({
              csv_import_id: csvImport.id,
              entity_type: "purchase_order",
              entity_id: purchaseOrder.id,
              action_type: "updated",
              previous_data: {
                total_cost: purchaseOrder.total_cost,
                status: purchaseOrder.status,
                expected_delivery_date: purchaseOrder.expected_delivery_date,
                actual_delivery_date: purchaseOrder.actual_delivery_date,
              },
            });
            restoredEntities.add(restoreKey);
          }
          await updateTable<PurchaseOrder>("purchase_orders", purchaseOrder.id, {
            total_cost: purchaseOrder.total_cost + row.quantity_ordered * row.unit_cost,
            status: row.status,
            expected_delivery_date: row.expected_delivery_date ?? purchaseOrder.expected_delivery_date,
            actual_delivery_date: row.actual_delivery_date ?? purchaseOrder.actual_delivery_date,
          });
        }

        await supabase.from("po_line_items").insert({
          purchase_order_id: purchaseOrder.id,
          product_id: product.id,
          sku: row.sku,
          product_name: row.product_name,
          quantity_ordered: row.quantity_ordered,
          quantity_received: row.quantity_received,
          unit_cost: row.unit_cost,
          line_total: row.quantity_ordered * row.unit_cost,
        });
        const { data: insertedLineItem, error: insertedLineItemError } = await supabase
          .from("po_line_items")
          .select("id")
          .eq("purchase_order_id", purchaseOrder.id)
          .eq("sku", row.sku)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (insertedLineItemError) throw insertedLineItemError;
        await recordImportLink({
          csv_import_id: csvImport.id,
          entity_type: "po_line_item",
          entity_id: (insertedLineItem as { id: string }).id,
          action_type: "created",
          previous_data: null,
        });

        if (row.quantity_received > 0) {
          const { data: insertedInventoryEvent, error: insertedInventoryEventError } = await supabase.from("inventory_events").insert({
            product_id: product.id,
            location_id: location.id,
            related_po_id: purchaseOrder.id,
            event_type: "PO Received",
            quantity_change: row.quantity_received,
            event_date: row.actual_delivery_date ?? row.expected_delivery_date ?? row.order_date,
            notes: row.notes,
          }).select().single();
          if (insertedInventoryEventError) throw insertedInventoryEventError;
          await recordImportLink({
            csv_import_id: csvImport.id,
            entity_type: "inventory_event",
            entity_id: (insertedInventoryEvent as { id: string }).id,
            action_type: "created",
            previous_data: null,
          });

          const { data: existingInventoryItem } = await supabase
            .from("inventory_items")
            .select("*")
            .eq("product_id", product.id)
            .eq("location_id", location.id)
            .maybeSingle();

          if (existingInventoryItem) {
            const inventoryItem = existingInventoryItem as InventoryItem;
            const restoreKey = `inventory_item:${inventoryItem.id}`;
            if (!restoredEntities.has(restoreKey)) {
              await recordImportLink({
                csv_import_id: csvImport.id,
                entity_type: "inventory_item",
                entity_id: inventoryItem.id,
                action_type: "updated",
                previous_data: {
                  quantity_on_hand: inventoryItem.quantity_on_hand,
                  reorder_point: inventoryItem.reorder_point,
                  target_stock: inventoryItem.target_stock,
                  notes: inventoryItem.notes,
                },
              });
              restoredEntities.add(restoreKey);
            }

            await updateTable<InventoryItem>("inventory_items", inventoryItem.id, {
              quantity_on_hand: inventoryItem.quantity_on_hand + row.quantity_received,
            });
          } else {
            const [createdInventoryItem] = (await insertTable<InventoryItem>("inventory_items", {
              product_id: product.id,
              location_id: location.id,
              quantity_on_hand: row.quantity_received,
              reorder_point: product.safety_stock,
              target_stock: Math.max(product.safety_stock * 2, row.quantity_received),
              notes: `Created from import ${fileName}`,
            })) as InventoryItem[];

            await recordImportLink({
              csv_import_id: csvImport.id,
              entity_type: "inventory_item",
              entity_id: createdInventoryItem.id,
              action_type: "created",
              previous_data: null,
            });
          }

          await syncProductInventoryFromItems(product.id);
        }

        successfulRows += 1;
      } catch (error) {
        failedRows += 1;
        await insertTable<CsvImportError>("csv_import_errors", {
          csv_import_id: csvImport.id,
          row_number: index + 2,
          error_message: error instanceof Error ? error.message : "Unexpected import error",
          raw_row: rows[index],
        });
      }
    }

    const updatedImport = await updateTable<CsvImport>("csv_imports", csvImport.id, {
      successful_rows: successfulRows,
      failed_rows: failedRows,
      import_status: failedRows > 0 ? "Partial" : "Completed",
    });

    await activityService.create({
      event_type: "csv_imported",
      entity_type: "csv_import",
      entity_id: csvImport.id,
      title: "CSV imported",
      description: `${fileName} processed with ${successfulRows} successful rows.`,
      metadata: { fileName, successfulRows, failedRows },
    });

    return {
      importRecord: updatedImport,
      successfulRows,
      failedRows,
      validationErrors,
    };
  },

  async undoImport(importId: string) {
    const supabase = assertSupabase();
    const { data: importRecord, error: importRecordError } = await supabase
      .from("csv_imports")
      .select("*")
      .eq("id", importId)
      .single();
    if (importRecordError) throw importRecordError;
    if ((importRecord as CsvImport).import_status === "Rolled Back") {
      throw new Error("This import has already been rolled back.");
    }

    const { data: links, error: linksError } = await supabase
      .from("csv_import_entity_links")
      .select("*")
      .eq("csv_import_id", importId)
      .order("created_at", { ascending: false });
    if (linksError) throw linksError;
    if (!(links ?? []).length) {
      throw new Error("This import does not have lineage metadata, so it cannot be rolled back safely.");
    }

    for (const link of (links ?? []) as CsvImportEntityLink[]) {
      const table = getTableForEntityType(link.entity_type);
      if (link.action_type === "created") {
        await deleteFromTable(table, link.entity_id);
      } else if (link.action_type === "updated") {
        await updateTable(table, link.entity_id, (link.previous_data ?? {}) as Record<string, unknown>);
      }
    }

    await syncAllProductInventoryFromItems();
    await updateTable<CsvImport>("csv_imports", importId, {
      import_status: "Rolled Back",
    });

    await activityService.create({
      event_type: "csv_import_rolled_back",
      entity_type: "csv_import",
      entity_id: importId,
      title: "CSV import rolled back",
      description: `${(importRecord as CsvImport).file_name} was rolled back using import lineage.`,
      metadata: { importId },
    });
  },

  async resetImportedData(password: string) {
    if (password !== importResetPassword) {
      throw new Error("Incorrect reset password.");
    }

    const supabase = assertSupabase();
    const { data: importedPos, error: importedPosError } = await supabase
      .from("purchase_orders")
      .select("id")
      .not("source_file_name", "is", null);
    if (importedPosError) throw importedPosError;

    const purchaseOrderIds = ((importedPos ?? []) as Array<{ id: string }>).map((purchaseOrder) => purchaseOrder.id);

    if (purchaseOrderIds.length) {
      const { error: inventoryEventsError } = await supabase
        .from("inventory_events")
        .delete()
        .in("related_po_id", purchaseOrderIds);
      if (inventoryEventsError) throw inventoryEventsError;

      const { error: purchaseOrdersError } = await supabase
        .from("purchase_orders")
        .delete()
        .in("id", purchaseOrderIds);
      if (purchaseOrdersError) throw purchaseOrdersError;
    }

    const { error: importErrorsError } = await supabase.from("csv_import_errors").delete().not("id", "is", null);
    if (importErrorsError) throw importErrorsError;

    const { error: importsError } = await supabase.from("csv_imports").delete().not("id", "is", null);
    if (importsError) throw importsError;

    await syncAllProductInventoryFromItems();

    await activityService.create({
      event_type: "imports_reset",
      entity_type: "csv_import",
      entity_id: null,
      title: "Imported data reset",
      description: "Imported purchase orders, related line items, import logs, and related PO inventory events were cleared.",
      metadata: { clearedPurchaseOrders: purchaseOrderIds.length },
    });
  },
};
