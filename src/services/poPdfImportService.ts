import { assertSupabase } from "@/lib/supabase";
import { activityService } from "@/services/activityService";
import { insertTable, updateTable } from "@/services/baseService";
import { dashboardSessionService } from "@/services/dashboardSessionService";
import { invoiceService } from "@/services/invoiceService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  PoLineItem,
  PoPdfImport,
  Product,
  ProductBarcode,
  PurchaseOrder,
  Retailer,
  RetailerProductAlias,
} from "@/types/domain";
import type { ExtractedPurchaseOrder, PoExtractionResponse } from "@/types/poImport";
import { buildCatalogIndex, buildReview, normalizeUpc, type ReviewPurchaseOrder } from "@/utils/poImportMatching";

export interface PoImportCatalog {
  products: Product[];
  productsById: Map<string, Product>;
  retailers: Retailer[];
}

export interface PoImportCommitResult {
  poNumber: string;
  purchaseOrderId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  error: string | null;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").replace(/^data:[^;]+;base64,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

function shipToCompanyName(po: ExtractedPurchaseOrder) {
  const { store_code: storeCode, company } = po.ship_to;
  if (storeCode && company && !company.startsWith(storeCode)) return `${storeCode} ${company}`;
  return company ?? storeCode ?? null;
}

async function loadCatalog() {
  const supabase = assertSupabase();
  const [productsRes, barcodesRes, aliasesRes, retailersRes] = await Promise.all([
    supabase.from("products").select("*"),
    supabase.from("product_barcodes").select("*, product_barcode_links(*)"),
    supabase.from("retailer_product_aliases").select("*"),
    supabase.from("retailers").select("*"),
  ]);
  [productsRes, barcodesRes, aliasesRes, retailersRes].forEach((response) => {
    if (response.error) throw response.error;
  });
  return {
    products: (productsRes.data ?? []) as Product[],
    barcodes: (barcodesRes.data ?? []) as ProductBarcode[],
    aliases: (aliasesRes.data ?? []) as RetailerProductAlias[],
    retailers: (retailersRes.data ?? []) as Retailer[],
  };
}

async function findOrCreateRetailer(po: ExtractedPurchaseOrder, cache: Map<string, string>) {
  const name = po.bill_to.company?.trim();
  if (!name) return null;
  const cached = cache.get(name.toLowerCase());
  if (cached) return cached;
  const supabase = assertSupabase();
  const { data, error } = await supabase
    .from("retailers")
    .insert({
      name,
      status: "Active",
      billing_company_name: name,
      billing_street: po.bill_to.street,
      billing_city: po.bill_to.city,
      billing_state: po.bill_to.state,
      billing_zip: po.bill_to.zip,
      default_payment_terms: po.payment_terms_raw,
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = (data as { id: string }).id;
  cache.set(name.toLowerCase(), id);
  return id;
}

export const poPdfImportService = {
  /** Reads the PDF with the extraction endpoint and matches every line against the catalog. */
  async extract(file: File): Promise<{ importId: string; review: ReviewPurchaseOrder[]; catalog: PoImportCatalog }> {
    const user = await dashboardSessionService.requireCurrentUser();
    const pdfBase64 = await readFileAsBase64(file);

    const response = await fetch("/api/po-import/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dashboardSessionService.getToken() ?? ""}`,
      },
      body: JSON.stringify({ pdfBase64 }),
    });
    const payload = (await response.json().catch(() => null)) as (PoExtractionResponse & { error?: string }) | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.error ?? `Could not read the PDF (HTTP ${response.status}).`);
    }
    const extracted = payload.purchase_orders ?? [];
    if (!extracted.length) {
      throw new Error("No purchase orders were found in this PDF.");
    }

    const [importRecord] = (await insertTable<PoPdfImport>("po_pdf_imports", {
      file_name: file.name,
      status: "Extracted",
      extracted: payload as unknown as Record<string, unknown>,
      created_by_label: user.display_name || user.email,
    })) as PoPdfImport[];

    const catalog = await loadCatalog();
    const supabase = assertSupabase();
    const { data: existing, error: existingError } = await supabase
      .from("purchase_orders")
      .select("id, po_number, retailer_id")
      .in("po_number", extracted.map((po) => po.po_number));
    if (existingError) throw existingError;

    const index = buildCatalogIndex(catalog.products, catalog.barcodes, catalog.aliases);
    const review = buildReview({
      extracted,
      index,
      retailers: catalog.retailers,
      existingPurchaseOrders: (existing ?? []) as Array<{ id: string; po_number: string; retailer_id: string | null }>,
    });

    return {
      importId: importRecord.id,
      review,
      catalog: {
        products: [...index.productsById.values()].sort((a, b) => a.name.localeCompare(b.name)),
        productsById: index.productsById,
        retailers: catalog.retailers,
      },
    };
  },

  /** Creates a Retailer PO and its invoice for every included PO. One failure does not stop the rest. */
  async commit(input: {
    importId: string;
    fileName: string;
    review: ReviewPurchaseOrder[];
    productsById: Map<string, Product>;
  }): Promise<PoImportCommitResult[]> {
    const supabase = assertSupabase();
    const retailerCache = new Map<string, string>();
    const results: PoImportCommitResult[] = [];

    for (const po of input.review.filter((candidate) => candidate.include)) {
      const extracted = po.extracted;
      try {
        const retailerId = po.retailerId ?? (await findOrCreateRetailer(extracted, retailerCache));

        const lineItems: Array<Partial<PoLineItem>> = po.lines.map((line, index) => {
          const product = line.productId ? input.productsById.get(line.productId) ?? null : null;
          const quantity = Number(line.extracted.quantity ?? 0);
          const unitCost = Number(line.extracted.unit_cost ?? 0);
          const unitRetail = Number(line.extracted.unit_retail ?? 0);
          return {
            product_id: product?.id ?? null,
            sku: product?.sku ?? line.extracted.vendor_style ?? "UNMATCHED",
            upc: product?.upc ?? (normalizeUpc(line.extracted.upc) || null),
            product_name: product?.name ?? line.extracted.description ?? "Unmatched item",
            description: line.extracted.description,
            retailer_item_number: line.extracted.retailer_item_number,
            unit: "EA",
            quantity_ordered: quantity,
            unit_quantity: quantity,
            unit_cost: unitCost,
            unit_retail: unitRetail,
            extended_cost: quantity * unitCost,
            extended_retail: quantity * unitRetail,
            sort_order: index,
          };
        });

        const purchaseOrder: Partial<PurchaseOrder> = {
          po_number: extracted.po_number,
          po_type: "Retailer PO",
          status: "Pending Approval",
          retailer_id: retailerId,
          order_date: extracted.order_date,
          start_ship_date: extracted.start_ship_date,
          ship_complete_date: extracted.ship_complete_date,
          currency_code: extracted.currency ?? "USD",
          payment_terms_snapshot: extracted.payment_terms_raw,
          buyer_name_snapshot: extracted.buyer_name,
          bill_to_company_name: extracted.bill_to.company,
          bill_to_street: extracted.bill_to.street,
          bill_to_city: extracted.bill_to.city,
          bill_to_state: extracted.bill_to.state,
          bill_to_zip: extracted.bill_to.zip,
          ship_to_company_name: shipToCompanyName(extracted),
          ship_to_street: extracted.ship_to.street,
          ship_to_city: extracted.ship_to.city,
          ship_to_state: extracted.ship_to.state,
          ship_to_zip: extracted.ship_to.zip,
          source_channel: "PDF Import",
          source_file_name: input.fileName,
          notes: extracted.additional_ship_to ? `Additional ship to: ${extracted.additional_ship_to}` : null,
        };

        const savedPo = await purchaseOrderService.savePurchaseOrder({ purchaseOrder, lineItems });

        // Remember manual mappings so this retailer item matches automatically next time.
        const learned = po.lines
          .filter((line) => line.matchSource === "manual" && line.productId && line.extracted.retailer_item_number)
          .map((line) => ({
            retailer_id: retailerId,
            retailer_item_number: line.extracted.retailer_item_number,
            vendor_style: line.extracted.vendor_style,
            upc: normalizeUpc(line.extracted.upc) || null,
            product_id: line.productId,
            updated_at: new Date().toISOString(),
          }));
        if (retailerId && learned.length) {
          const { error: aliasError } = await supabase
            .from("retailer_product_aliases")
            .upsert(learned, { onConflict: "retailer_id,retailer_item_number" });
          if (aliasError) throw aliasError;
        }

        const invoice = await invoiceService.convertFromPo(savedPo.id, { warnings: po.warnings });
        results.push({
          poNumber: extracted.po_number,
          purchaseOrderId: savedPo.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          error: null,
        });
      } catch (error) {
        results.push({
          poNumber: extracted.po_number,
          purchaseOrderId: null,
          invoiceId: null,
          invoiceNumber: null,
          error: error instanceof Error ? error.message : "Unexpected error.",
        });
      }
    }

    const created = results.filter((result) => !result.error);
    await updateTable<PoPdfImport>("po_pdf_imports", input.importId, {
      status: created.length ? "Committed" : "Failed",
      created_purchase_order_ids: created.map((result) => result.purchaseOrderId!),
      created_invoice_ids: created.map((result) => result.invoiceId!),
      updated_at: new Date().toISOString(),
    });
    await activityService.create({
      event_type: "po_pdf_imported",
      entity_type: "po_pdf_import",
      entity_id: input.importId,
      title: `PO PDF imported: ${input.fileName}`,
      description: `${created.length} purchase orders and invoices created${results.length > created.length ? `, ${results.length - created.length} failed` : ""}.`,
      metadata: { importId: input.importId, results },
    });

    return results;
  },

  /** Loads invoices with their lines, for printing a whole batch at once. */
  async loadInvoicesForPrint(invoiceIds: string[]) {
    return Promise.all(invoiceIds.map((id) => invoiceService.getById(id)));
  },
};
