import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { insertTable, updateTable } from "@/services/baseService";
import type {
  CsvImport,
  CsvImportError,
  MappingPreset,
  NormalizedImportRow,
  Product,
  PurchaseOrder,
  Vendor,
} from "@/types/domain";
import { inferMapping, normalizeRows, parseCsvFile, validateNormalizedRows } from "@/utils/csv";

async function findOrCreateVendor(name: string) {
  const supabase = assertSupabase();
  const { data: existing } = await supabase.from("vendors").select("*").ilike("name", name).limit(1).maybeSingle();
  if (existing) return existing as Vendor;
  const { data, error } = await supabase.from("vendors").insert({ name }).select().single();
  if (error) throw error;
  return data as Vendor;
}

async function findOrCreateLocation(name: string) {
  const supabase = assertSupabase();
  const { data: existing } = await supabase.from("locations").select("*").ilike("name", name).limit(1).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from("locations").insert({ name, type: "Warehouse" }).select().single();
  if (error) throw error;
  return data;
}

async function findOrCreateProduct(row: NormalizedImportRow) {
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
  return data as Product;
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
    .maybeSingle();
  return Boolean(lineItem);
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

    for (const [index, row] of normalizedRows.entries()) {
      try {
        if (validationErrors.some((error) => error.rowNumber === index + 2)) continue;
        const vendor = await findOrCreateVendor(row.vendor_name);
        const location = await findOrCreateLocation(row.location_name || "Main Warehouse");
        const product = await findOrCreateProduct(row);

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
        } else {
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

        if (row.quantity_received > 0) {
          await supabase.from("inventory_events").insert({
            product_id: product.id,
            location_id: location.id,
            related_po_id: purchaseOrder.id,
            event_type: "PO Received",
            quantity_change: row.quantity_received,
            event_date: row.actual_delivery_date ?? row.expected_delivery_date ?? row.order_date,
            notes: row.notes,
          });

          await updateTable<Product>("products", product.id, {
            current_inventory: product.current_inventory + row.quantity_received,
          });
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
};
