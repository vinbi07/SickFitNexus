import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, upsertTable } from "@/services/baseService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type {
  PoLineItem,
  ProductionPlan,
  ProductionPlanItem,
  ProductionPlanStatus,
  ProductionSimulationRun,
  PurchaseOrder,
} from "@/types/domain";
import { getReadinessBlockers } from "@/utils/productionSimulation";

export interface ProductionPlanListFilters {
  status?: ProductionPlanStatus;
  vendorId?: string;
  search?: string;
}

export const productionPlanService = {
  async list(filters: ProductionPlanListFilters = {}) {
    const supabase = assertSupabase();
    let query = supabase.from("production_plans").select("*, vendors(*), locations(*)").order("updated_at", { ascending: false });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters.search) query = query.ilike("name", `%${filters.search}%`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProductionPlan[];
  },

  async getById(id: string) {
    const supabase = assertSupabase();
    const [planResponse, itemsResponse] = await Promise.all([
      supabase.from("production_plans").select("*, vendors(*), locations(*)").eq("id", id).single(),
      supabase
        .from("production_plan_items")
        .select("*, products(*)")
        .eq("plan_id", id)
        .order("sort_order", { ascending: true }),
    ]);
    if (planResponse.error) throw planResponse.error;
    if (itemsResponse.error) throw itemsResponse.error;
    return {
      ...(planResponse.data as ProductionPlan),
      items: (itemsResponse.data ?? []) as ProductionPlanItem[],
    };
  },

  async upsert(plan: Partial<ProductionPlan>, items: Array<Partial<ProductionPlanItem>>) {
    // vendors/locations/items are joined/attached fields from getById(), not real columns —
    // strip them before spreading into the upsert payload or PostgREST rejects the write.
    const { vendors: _vendors, locations: _locations, items: _planItems, ...planPayload } = plan;
    const [savedPlan] = (await upsertTable<ProductionPlan>("production_plans", {
      ...planPayload,
      name: planPayload.name ? String(planPayload.name) : "Untitled Plan",
      goal: planPayload.goal ?? "restock",
      status: planPayload.status ?? "Draft",
      demand_method: planPayload.demand_method ?? "avg_daily_usage",
      coverage_target_days: planPayload.coverage_target_days ?? 30,
      include_allocated: planPayload.include_allocated ?? true,
      include_existing_incoming: planPayload.include_existing_incoming ?? true,
      source_type: planPayload.source_type ?? "blank",
    })) as ProductionPlan[];

    const supabase = assertSupabase();
    const { data: existingRows, error: existingError } = await supabase
      .from("production_plan_items")
      .select("id")
      .eq("plan_id", savedPlan.id);
    if (existingError) throw existingError;

    const existingIds = new Set(((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id));
    const submittedIds = new Set(items.map((item) => item.id).filter((id): id is string => Boolean(id)));

    await Promise.all(
      [...existingIds].filter((id) => !submittedIds.has(id)).map((id) => deleteFromTable("production_plan_items", id)),
    );

    if (items.length) {
      await upsertTable<ProductionPlanItem>(
        "production_plan_items",
        items.map((item, index) => ({
          id: item.id || crypto.randomUUID(),
          plan_id: savedPlan.id,
          product_id: item.product_id,
          planned_quantity: Number(item.planned_quantity ?? 0),
          moq: item.moq ?? null,
          order_increment: item.order_increment ?? null,
          unit_cost: item.unit_cost ?? null,
          manual_daily_demand: item.manual_daily_demand ?? null,
          design_id: item.design_id ?? null,
          spec_snapshot: item.spec_snapshot ?? {},
          sock_card_id: item.sock_card_id ?? null,
          pack_pairs: Number(item.pack_pairs ?? 1),
          sock_size: item.sock_size ?? null,
          construction: item.construction ?? null,
          cards_used: Number(item.cards_used ?? 0),
          box_no: item.box_no ?? null,
          pantone: item.pantone ?? null,
          barcode_required: Boolean(item.barcode_required),
          art_status: item.art_status ?? null,
          art_note: item.art_note ?? null,
          mockup_file_ref: item.mockup_file_ref ?? null,
          artwork_file_ref: item.artwork_file_ref ?? null,
          rib_lr: item.rib_lr ?? true,
          toe: item.toe ?? true,
          pattern: Boolean(item.pattern),
          signature: Boolean(item.signature),
          foot_text: item.foot_text ?? null,
          sort_order: Number(item.sort_order ?? index),
        })),
      );
    }

    return this.getById(savedPlan.id);
  },

  async updateStatus(id: string, status: ProductionPlanStatus) {
    const supabase = assertSupabase();
    const patch: Partial<ProductionPlan> = { status };
    if (status === "Approved") patch.approved_at = new Date().toISOString();
    const { data, error } = await supabase.from("production_plans").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return data as ProductionPlan;
  },

  remove: (id: string) => deleteFromTable("production_plans", id),

  /**
   * Validates and converts an approved plan's active, non-stale simulation run into one
   * or more Manufacturer POs, preserving plan/run lineage. Read-only against inventory —
   * it never touches products, inventory_items, inventory_events, or capacity_snapshots;
   * only the existing receive-inventory flow changes on-hand inventory.
   * Idempotent: repeat calls return the already-converted POs instead of duplicating them.
   * Produces a single PO against the plan's manufacturer — splitting a run across
   * multiple manufacturers is not yet supported since plan items don't carry a
   * per-item manufacturer assignment (only the plan-level vendor_id).
   */
  async convertToManufacturerPO(params: {
    plan: ProductionPlan;
    items: ProductionPlanItem[];
    run: ProductionSimulationRun;
  }): Promise<PurchaseOrder[]> {
    const { plan, items, run } = params;

    if (plan.status !== "Approved") throw new Error("Only an approved plan can be converted to a Manufacturer PO.");
    if (plan.active_simulation_run_id !== run.id) throw new Error("Select the plan's active simulation version before converting.");
    if (run.is_stale) throw new Error("This simulation result is stale — re-run the simulation before converting.");
    if (!plan.vendor_id) throw new Error("Select a manufacturer before converting this plan.");
    if (!plan.planned_order_date) throw new Error("Set a planned order date before converting this plan.");
    if (!plan.target_arrival_date) throw new Error("Set a target arrival date before converting this plan.");
    if (!items.length) throw new Error("This plan has no products to convert.");

    const resultByProductId = new Map(run.result_snapshot.skuResults.map((sku) => [sku.productId, sku]));

    // Items left at zero planned quantity are treated as intentionally excluded from
    // this run (e.g. a recommendation reduced them to zero) rather than as blockers —
    // only items actually going into the PO need readiness/cost validation.
    const includedItems = items.filter((item) => (resultByProductId.get(item.product_id)?.roundedQuantity ?? 0) > 0);
    if (!includedItems.length) throw new Error("No products in this plan have a positive planned quantity.");

    const blockers = includedItems.flatMap((item) => getReadinessBlockers(item));
    if (blockers.length) throw new Error(`Readiness blockers must be resolved before converting: ${[...new Set(blockers)].join(" ")}`);

    for (const item of includedItems) {
      if (!(Number(item.unit_cost ?? 0) > 0)) throw new Error(`${item.products?.name ?? item.product_id} is missing a unit cost.`);
    }

    const supabase = assertSupabase();
    const { data: existingPos, error: existingError } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("source_production_plan_id", plan.id)
      .eq("source_simulation_run_id", run.id);
    if (existingError) throw existingError;
    if (existingPos?.length) return existingPos as PurchaseOrder[];

    const lineItems: Array<Partial<PoLineItem>> = includedItems.map((item) => {
      const skuResult = resultByProductId.get(item.product_id);
      const product = item.products;
      return {
        product_id: item.product_id,
        sku: product?.sku ?? "",
        upc: product?.upc ?? null,
        product_name: product?.name ?? "",
        quantity_ordered: skuResult?.roundedQuantity ?? 0,
        unit_cost: Number(item.unit_cost ?? product?.unit_cost ?? 0),
        unit_retail: Number(product?.unit_price ?? 0),
        case_pack_quantity: item.order_increment ?? 1,
        design_id: item.design_id,
        spec_snapshot: item.spec_snapshot,
        sock_card_id: item.sock_card_id,
        pack_pairs: item.pack_pairs,
        sock_size: item.sock_size,
        construction: item.construction,
        cards_used: item.cards_used,
        box_no: item.box_no,
        pantone: item.pantone,
        barcode_required: item.barcode_required,
        art_status: item.art_status,
        art_note: item.art_note,
        mockup_file_ref: item.mockup_file_ref,
        artwork_file_ref: item.artwork_file_ref,
        rib_lr: item.rib_lr,
        toe: item.toe,
        pattern: item.pattern,
        signature: item.signature,
        foot_text: item.foot_text,
      };
    });

    const poNumber = await purchaseOrderService.generatePoNumber();
    const created = await purchaseOrderService.savePurchaseOrder({
      purchaseOrder: {
        po_number: poNumber,
        po_type: "Manufacturer PO",
        status: "Draft",
        vendor_id: plan.vendor_id,
        location_id: plan.location_id,
        order_date: plan.planned_order_date,
        expected_delivery_date: plan.target_arrival_date,
        eta_date: plan.target_arrival_date,
        requested_action: "draft",
        source_production_plan_id: plan.id,
        source_simulation_run_id: run.id,
        notes: `Converted from production plan "${plan.name}" (simulation v${run.simulation_version}).`,
      },
      lineItems,
    });

    await this.updateStatus(plan.id, "Converted");

    return [created];
  },
};
