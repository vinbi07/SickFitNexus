import { assertSupabase } from "@/lib/supabase";
import { upsertTable } from "@/services/baseService";
import { supportService } from "@/services/supportService";
import type { OrderDesign } from "@/types/domain";

export type CatalogDesignOption = {
  source: "order_design" | "barcode";
  id: string;
  label: string;
  design: Partial<OrderDesign>;
};

export const orderDesignService = {
  async listDesigns(): Promise<OrderDesign[]> {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("order_designs")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as OrderDesign[];
  },

  async listCatalog(): Promise<CatalogDesignOption[]> {
    const [internalDesigns, barcodes] = await Promise.all([
      orderDesignService.listDesigns(),
      supportService.listBarcodes(),
    ]);

    const internalOptions: CatalogDesignOption[] = internalDesigns.map((design) => ({
      source: "order_design",
      id: design.id,
      label: design.partner ? `${design.name} — ${design.partner}` : design.name,
      design,
    }));

    // Convert barcode rows into catalog-like OrderDesign objects for standard SKUs
    // that are not already covered by an order_design entry.
    const internalBarcodeIds = new Set(internalDesigns.map((d) => d.barcode_id).filter(Boolean));

    const barcodeOptions: CatalogDesignOption[] = barcodes
      .filter((b) => !internalBarcodeIds.has(b.id))
      .map((barcode) => {
        const linkedProduct = (barcode.product_barcode_links ?? []).find((link) => link.products)?.products ?? null;
        const design: Partial<OrderDesign> = {
          name: barcode.product_name,
          type: "standard",
          barcode: barcode.barcode_upc ?? undefined,
          barcode_required: Boolean(barcode.barcode_upc),
          retail_price: Number(linkedProduct?.unit_price ?? linkedProduct?.msrp ?? 0),
          exw_cost: Number(linkedProduct?.wholesale_price ?? linkedProduct?.unit_cost ?? 1.89),
          construction: barcode.size ? undefined : "Crew",
          art_status: "ON FILE",
          rib_lr: true,
          toe: true,
          pattern: false,
          signature: false,
          in_shopify: Boolean(linkedProduct?.shopify_product_id),
          shopify_product_id: linkedProduct?.shopify_product_id ?? null,
          product_id: linkedProduct?.id ?? null,
          barcode_id: barcode.id,
        };
        return {
          source: "barcode",
          id: barcode.id,
          label: barcode.product_name,
          design,
        };
      });

    return [...internalOptions, ...barcodeOptions].sort((a, b) => a.label.localeCompare(b.label));
  },

  async saveDesign(payload: Partial<OrderDesign>): Promise<OrderDesign> {
    const [saved] = (await upsertTable<OrderDesign>("order_designs", payload)) as OrderDesign[];
    return saved;
  },
};
