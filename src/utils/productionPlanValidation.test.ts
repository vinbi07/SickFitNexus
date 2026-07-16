import { describe, expect, it } from "vitest";
import type { ProductionPlan, ProductionPlanItem } from "@/types/domain";
import { describeSaveError, validateProductionPlanDraft } from "@/utils/productionPlanValidation";

const basePlan: ProductionPlan = {
  id: "plan-1",
  name: "Core Restock",
  goal: "restock",
  status: "Draft",
  vendor_id: "vendor-1",
  location_id: null,
  horizon_start: "2026-07-01",
  horizon_end: "2026-07-30",
  planned_order_date: "2026-07-01",
  target_arrival_date: "2026-07-20",
  production_lane: null,
  production_week: "2026-07-13",
  demand_method: "avg_daily_usage",
  coverage_target_days: 30,
  safety_stock_override: null,
  include_allocated: true,
  include_existing_incoming: true,
  source_type: "blank",
  source_template_id: null,
  source_plan_id: null,
  active_simulation_run_id: null,
  approved_at: null,
  approved_by: null,
  notes: null,
  created_at: "",
  updated_at: "",
};

const basePlanItem: ProductionPlanItem = {
  id: "item-1",
  plan_id: "plan-1",
  product_id: "product-1",
  planned_quantity: 300,
  moq: 100,
  order_increment: 50,
  unit_cost: 4,
  manual_daily_demand: null,
  design_id: null,
  spec_snapshot: {},
  sock_card_id: null,
  pack_pairs: 1,
  sock_size: "M",
  construction: "Crew",
  cards_used: 0,
  box_no: null,
  pantone: null,
  barcode_required: false,
  art_status: "Approved",
  art_note: null,
  mockup_file_ref: null,
  artwork_file_ref: null,
  rib_lr: true,
  toe: true,
  pattern: false,
  signature: false,
  foot_text: null,
  sort_order: 0,
  created_at: "",
  updated_at: "",
};

describe("validateProductionPlanDraft", () => {
  it("returns no errors for a valid plan and items", () => {
    const result = validateProductionPlanDraft(basePlan, [basePlanItem]);
    expect(result.planErrors).toEqual([]);
    expect(result.itemErrors).toEqual([]);
  });

  it("flags a missing plan name", () => {
    const result = validateProductionPlanDraft({ ...basePlan, name: "  " }, []);
    expect(result.planErrors).toEqual([{ field: "name", message: "Plan Name is required." }]);
  });

  it("flags horizon end before horizon start", () => {
    const result = validateProductionPlanDraft(
      { ...basePlan, horizon_start: "2026-07-30", horizon_end: "2026-07-01" },
      [],
    );
    expect(result.planErrors).toEqual([
      { field: "horizon_end", message: "Horizon End must be on or after Horizon Start." },
    ]);
  });

  it("flags a negative planned quantity", () => {
    const result = validateProductionPlanDraft(basePlan, [{ ...basePlanItem, planned_quantity: -5 }]);
    expect(result.itemErrors).toEqual([
      { productId: "product-1", field: "planned_quantity", message: "product-1: Planned Qty cannot be negative." },
    ]);
  });

  it("flags negative MOQ, increment, and unit cost independently", () => {
    const result = validateProductionPlanDraft(basePlan, [
      { ...basePlanItem, moq: -1, order_increment: -1, unit_cost: -1 },
    ]);
    expect(result.itemErrors).toHaveLength(3);
    expect(result.itemErrors.map((error) => error.field).sort()).toEqual(["moq", "order_increment", "unit_cost"]);
  });

  it("does not flag null/undefined optional item fields", () => {
    const result = validateProductionPlanDraft(basePlan, [{ ...basePlanItem, moq: null, order_increment: null, unit_cost: null }]);
    expect(result.itemErrors).toEqual([]);
  });
});

describe("describeSaveError", () => {
  it("translates a not-null constraint violation into a friendly message", () => {
    const error = new Error('null value in column "horizon_start" of relation "production_plans" violates not-null constraint');
    expect(describeSaveError(error)).toBe("Horizon Start is required.");
  });

  it("translates the horizon check constraint", () => {
    const error = new Error('new row for relation "production_plans" violates check constraint "production_plans_horizon_check"');
    expect(describeSaveError(error)).toBe("Horizon End must be on or after Horizon Start.");
  });

  it("translates the item quantity check constraint", () => {
    const error = new Error('new row for relation "production_plan_items" violates check constraint "production_plan_items_quantity_check"');
    expect(describeSaveError(error)).toBe("Planned Qty cannot be negative.");
  });

  it("translates a unique constraint violation", () => {
    const error = new Error("duplicate key value violates unique constraint \"production_plan_items_plan_id_product_id_key\"");
    expect(describeSaveError(error)).toBe("That product is already in this plan.");
  });

  it("translates a foreign key violation", () => {
    const error = new Error('insert or update on table "production_plans" violates foreign key constraint "production_plans_vendor_id_fkey"');
    expect(describeSaveError(error)).toBe(
      "One of the selected values (e.g. manufacturer, location, or product) no longer exists — refresh and try again.",
    );
  });

  it("falls back to the raw message when nothing matches", () => {
    const error = new Error("Something unexpected happened.");
    expect(describeSaveError(error)).toBe("Something unexpected happened.");
  });
});
