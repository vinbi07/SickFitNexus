import { assertSupabase } from "@/lib/supabase";
import { capacityService } from "@/services/capacityService";
import { inventoryService } from "@/services/inventoryService";
import { productionPlanService } from "@/services/productionPlanService";
import { supportService } from "@/services/supportService";
import type {
  InventoryEvent,
  PoLineItem,
  ProductionRecommendation,
  ProductionSimulationInputSnapshot,
  ProductionSimulationRun,
  PurchaseOrder,
} from "@/types/domain";
import { generateRecommendations } from "@/utils/productionRecommendations";
import { runProductionSimulation } from "@/utils/productionSimulation";

async function listAllPurchaseOrdersWithLineItems() {
  const supabase = assertSupabase();
  const [posResponse, lineItemsResponse] = await Promise.all([
    supabase.from("purchase_orders").select("*"),
    supabase.from("po_line_items").select("*"),
  ]);
  if (posResponse.error) throw posResponse.error;
  if (lineItemsResponse.error) throw lineItemsResponse.error;

  const purchaseOrders = (posResponse.data ?? []) as PurchaseOrder[];
  const lineItems = (lineItemsResponse.data ?? []) as PoLineItem[];
  const lineItemsByPo = new Map<string, PoLineItem[]>();
  for (const item of lineItems) {
    const current = lineItemsByPo.get(item.purchase_order_id) ?? [];
    current.push(item);
    lineItemsByPo.set(item.purchase_order_id, current);
  }
  return { purchaseOrders, lineItemsByPo };
}

export const productionSimulationService = {
  /**
   * Runs a fresh, read-only simulation for a plan and persists the result as a new
   * immutable version. Reads products/inventory/POs/capacity but never writes to
   * inventory, allocations, purchase orders, or capacity records.
   */
  async runSimulation(planId: string, scenarioName = "Scenario 1"): Promise<ProductionSimulationRun> {
    const [plan, products, events, { purchaseOrders, lineItemsByPo }, capacitySnapshots] = await Promise.all([
      productionPlanService.getById(planId),
      supportService.listProducts(),
      inventoryService.listEvents(),
      listAllPurchaseOrdersWithLineItems(),
      capacityService.list(),
    ]);

    const eventsByProductId = new Map<string, InventoryEvent[]>();
    for (const event of events) {
      if (!event.product_id) continue;
      const current = eventsByProductId.get(event.product_id) ?? [];
      current.push(event);
      eventsByProductId.set(event.product_id, current);
    }

    const supabase = assertSupabase();
    const { data: existingVersions, error: versionsError } = await supabase
      .from("production_simulation_runs")
      .select("simulation_version")
      .eq("plan_id", planId)
      .order("simulation_version", { ascending: false })
      .limit(1);
    if (versionsError) throw versionsError;
    const nextVersion = ((existingVersions ?? [])[0]?.simulation_version ?? 0) + 1;

    const resultSnapshot = runProductionSimulation({
      plan,
      items: plan.items ?? [],
      products,
      vendor: plan.vendors ?? null,
      eventsByProductId,
      purchaseOrders,
      lineItemsByPo,
      capacitySnapshots,
      simulationVersion: nextVersion,
    });

    const recommendations: ProductionRecommendation[] = generateRecommendations(resultSnapshot, plan);
    resultSnapshot.recommendations = recommendations;

    const inputSnapshot: ProductionSimulationInputSnapshot = {
      plan,
      items: plan.items ?? [],
      vendor: plan.vendors ?? null,
      capacitySnapshots,
      generatedAt: resultSnapshot.generatedAt,
    };

    const { data: insertedRows, error: insertError } = await supabase
      .from("production_simulation_runs")
      .insert({
        plan_id: planId,
        scenario_name: scenarioName,
        simulation_version: nextVersion,
        input_snapshot: inputSnapshot,
        result_snapshot: resultSnapshot,
        recommendations,
        is_stale: false,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    await supabase
      .from("production_simulation_runs")
      .update({ is_stale: true })
      .eq("plan_id", planId)
      .neq("id", insertedRows.id);

    await supabase
      .from("production_plans")
      .update({ active_simulation_run_id: insertedRows.id, status: "Simulated" })
      .eq("id", planId);

    return insertedRows as ProductionSimulationRun;
  },

  async listRuns(planId: string): Promise<ProductionSimulationRun[]> {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("production_simulation_runs")
      .select("*")
      .eq("plan_id", planId)
      .order("simulation_version", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProductionSimulationRun[];
  },

  async getRun(runId: string): Promise<ProductionSimulationRun> {
    const supabase = assertSupabase();
    const { data, error } = await supabase.from("production_simulation_runs").select("*").eq("id", runId).single();
    if (error) throw error;
    return data as ProductionSimulationRun;
  },

  /** Switches the plan's active scenario to an already-computed run — no recomputation. */
  async setActiveRun(planId: string, runId: string) {
    const supabase = assertSupabase();
    const { error } = await supabase.from("production_plans").update({ active_simulation_run_id: runId }).eq("id", planId);
    if (error) throw error;
  },

  async updateRecommendation(runId: string, recommendationId: string, patch: { isDismissed: boolean; dismissNote: string | null }) {
    const run = await this.getRun(runId);
    const recommendations = run.recommendations.map((recommendation) =>
      recommendation.id === recommendationId
        ? { ...recommendation, isDismissed: patch.isDismissed, dismissNote: patch.dismissNote }
        : recommendation,
    );
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("production_simulation_runs")
      .update({ recommendations })
      .eq("id", runId)
      .select()
      .single();
    if (error) throw error;
    return data as ProductionSimulationRun;
  },
};
