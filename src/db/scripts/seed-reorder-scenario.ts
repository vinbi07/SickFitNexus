#!/usr/bin/env node
/**
 * Seed a fully populated, realistic production-planning demo scenario using
 * real SickFit products, vendors, inventory history, and Shopify sales data
 * already in the database — no fabricated records.
 *
 * Builds one production plan (real vendor/location/SKUs, realistic manufacturing
 * spec fields) and runs it through the actual simulation engine three times
 * (Recommended / Conservative / Aggressive Growth) so every chart/tab on
 * /production/planner/:id renders real, internally-consistent numbers.
 *
 * Read-only against products, inventory_events, shopify orders, purchase_orders,
 * and capacity_snapshots — only production_plans, production_plan_items, and
 * production_simulation_runs rows are written. No Manufacturer PO is created;
 * that stays a manual "Convert to PO" action in the existing UI.
 *
 * Usage:
 *   npx tsx src/db/scripts/seed-reorder-scenario.ts
 *
 * Required environment variables (set in .env or shell):
 *   VITE_SUPABASE_URL         — your Supabase project URL
 *   VITE_SUPABASE_ANON_KEY    — anon key (production_plans/_items/_simulation_runs
 *                                have permissive RLS, so no service key is required)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { runProductionSimulation, type ProductionSimulationEngineInput } from "../../utils/productionSimulation";
import { generateRecommendations } from "../../utils/productionRecommendations";
import { calculateAverageDailyUsage } from "../../utils/forecasting";
import { isHiddenByDefaultProductName, isSlowMover } from "../../utils/operations";
import { addDays, toDateInput } from "../../utils/date";
import type {
  CapacitySnapshot,
  InventoryEvent,
  PoLineItem,
  Product,
  ProductionPlan,
  ProductionPlanItem,
  ProductionSimulationRun,
  PurchaseOrder,
  Vendor,
} from "../../types/domain";

// Load .env from project root (tsx doesn't auto-load it)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in your .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SKU_TARGET_COUNT = 14;
// Matches productionSimulation.ts's MILESTONE_SEQUENCE total (approval 3 + po_creation 2 +
// production 21 + quality_check 4 + packaging 5 + freight 14 + receiving 2), so the seeded
// dates line up with what the Production Schedule tab will actually draw.
const MILESTONE_TOTAL_DAYS = 3 + 2 + 21 + 4 + 5 + 14 + 2;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchAll<T>(table: string, select: string, extra?: (q: ReturnType<typeof supabase.from>) => typeof q): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const rows: T[] = [];
  for (;;) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (extra) query = extra(query);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function main() {
  console.log("Loading real vendors, locations, products, and demand history…");

  const vendors = await fetchAll<Vendor>("vendors", "*");
  const vendor = [...vendors].sort((a, b) => b.reliability_score - a.reliability_score)[0] ?? null;
  if (!vendor) throw new Error("No vendors found — cannot select a manufacturer.");

  const locations = await fetchAll<{ id: string; name: string }>("locations", "id, name");
  const location = locations.find((loc) => /warehouse/i.test(loc.name)) ?? locations[0];
  if (!location) throw new Error("No locations found.");

  const allProducts = await fetchAll<Product>("products", "*");
  const candidateProducts = allProducts.filter(
    (product) => Number(product.unit_cost) > 0 && product.sku && !isHiddenByDefaultProductName(product.name),
  );

  const productIds = candidateProducts.map((product) => product.id);
  const eventRows: InventoryEvent[] = [];
  for (const idBatch of chunk(productIds, 200)) {
    const rows = await fetchAll<InventoryEvent>("inventory_events", "*", (q) => q.in("product_id", idBatch) as typeof q);
    eventRows.push(...rows);
  }
  const eventsByProductId = new Map<string, InventoryEvent[]>();
  for (const event of eventRows) {
    if (!event.product_id) continue;
    const bucket = eventsByProductId.get(event.product_id) ?? [];
    bucket.push(event);
    eventsByProductId.set(event.product_id, bucket);
  }

  const purchaseOrders = await fetchAll<PurchaseOrder>("purchase_orders", "*");
  const poLineItems = await fetchAll<PoLineItem>("po_line_items", "*");
  const lineItemsByPo = new Map<string, PoLineItem[]>();
  for (const item of poLineItems) {
    const bucket = lineItemsByPo.get(item.purchase_order_id) ?? [];
    bucket.push(item);
    lineItemsByPo.set(item.purchase_order_id, bucket);
  }

  const capacitySnapshots = await fetchAll<CapacitySnapshot>("capacity_snapshots", "*");

  // Classify each candidate by real demand/inventory so the seeded plan has a
  // deliberate risk mix instead of an arbitrary slice of the catalog.
  const referenceDate = new Date();
  const classified = candidateProducts
    .map((product) => {
      const events = eventsByProductId.get(product.id) ?? [];
      const dailyUsage = calculateAverageDailyUsage(events);
      const daysOfSupply = dailyUsage > 0 ? Number(product.current_inventory ?? 0) / dailyUsage : Number.POSITIVE_INFINITY;
      return {
        product,
        events,
        dailyUsage,
        daysOfSupply,
        hasHistory: events.length >= 4,
        isSlow: isSlowMover(events, referenceDate),
      };
    })
    .filter((entry) => entry.hasHistory);

  const stockoutRisk = classified.filter((e) => !e.isSlow && e.daysOfSupply <= MILESTONE_TOTAL_DAYS).sort((a, b) => a.daysOfSupply - b.daysOfSupply);
  const healthy = classified.filter((e) => !e.isSlow && e.daysOfSupply > MILESTONE_TOTAL_DAYS).sort((a, b) => b.dailyUsage - a.dailyUsage);
  const slowMovers = classified.filter((e) => e.isSlow);

  const selected = [
    ...stockoutRisk.slice(0, 6),
    ...healthy.slice(0, 6),
    ...slowMovers.slice(0, 2),
  ].slice(0, SKU_TARGET_COUNT);

  if (selected.length < 3) {
    throw new Error(
      `Only found ${selected.length} products with enough real sales history to seed a meaningful plan. ` +
      "Import more Shopify order/inventory history before running this script.",
    );
  }

  console.log(
    `Selected ${selected.length} SKUs — ${stockoutRisk.length ? Math.min(6, stockoutRisk.length) : 0} stockout-risk, ` +
    `${healthy.length ? Math.min(6, healthy.length) : 0} healthy, ${slowMovers.length ? Math.min(2, slowMovers.length) : 0} slow mover.`,
  );

  const today = new Date();
  const plannedOrderDate = toDateInput(addDays(today, 5));
  const targetArrivalDate = toDateInput(addDays(new Date(`${plannedOrderDate}T00:00:00`), MILESTONE_TOTAL_DAYS));
  const horizonStart = toDateInput(today);
  const horizonEnd = toDateInput(addDays(new Date(`${targetArrivalDate}T00:00:00`), 45));

  const planId = randomUUID();
  const planRow = {
    id: planId,
    name: `Fall Restock — Recommended Plan (${toDateInput(today)})`,
    goal: "restock" as const,
    status: "Draft" as const,
    vendor_id: vendor.id,
    location_id: location.id,
    horizon_start: horizonStart,
    horizon_end: horizonEnd,
    planned_order_date: plannedOrderDate,
    target_arrival_date: targetArrivalDate,
    production_lane: "Domestic — Sock & Apparel Program",
    production_week: plannedOrderDate,
    demand_method: "trailing_90d" as const,
    coverage_target_days: 45,
    safety_stock_override: null,
    include_allocated: true,
    include_existing_incoming: true,
    source_type: "blank" as const,
    source_template_id: null,
    source_plan_id: null,
    active_simulation_run_id: null,
    approved_at: null,
    approved_by: null,
    notes: "Seeded from real SickFit product, vendor, and demand data for a full end-to-end demo of the Production Planner.",
  };

  console.log(`Creating plan "${planRow.name}"…`);
  const { data: savedPlanRows, error: planError } = await supabase.from("production_plans").insert(planRow).select();
  if (planError) throw planError;
  const savedPlan = savedPlanRows![0] as ProductionPlan;

  const artStatuses = ["Approved", "Approved", "Approved", "In Review"];
  const itemRows: ProductionPlanItem[] = selected.map((entry, index) => {
    const { product, dailyUsage } = entry;
    const suggested = Math.max(Math.ceil(dailyUsage * planRow.coverage_target_days - Number(product.current_inventory ?? 0)), 0);
    const baseline = suggested > 0 ? suggested : Math.max(Math.ceil(dailyUsage * 30), 24);
    const increment = product.case_pack_quantity && product.case_pack_quantity > 1 ? product.case_pack_quantity : 12;
    const moq = Math.max(increment * 2, 24);

    return {
      id: randomUUID(),
      plan_id: savedPlan.id,
      product_id: product.id,
      planned_quantity: Math.max(Math.ceil(baseline / increment) * increment, moq),
      moq,
      order_increment: increment,
      unit_cost: product.unit_cost,
      manual_daily_demand: null,
      design_id: null,
      spec_snapshot: {},
      sock_card_id: null,
      pack_pairs: /sock/i.test(product.name) ? 6 : 1,
      sock_size: /sock/i.test(product.name) ? "One Size" : null,
      construction: /sock/i.test(product.name) ? "Cotton-Poly Compression Knit" : "Cut & Sew, Cotton Blend",
      cards_used: 0,
      box_no: `BX-${(index + 1).toString().padStart(2, "0")}`,
      pantone: null,
      barcode_required: true,
      art_status: artStatuses[index % artStatuses.length],
      art_note: null,
      mockup_file_ref: null,
      artwork_file_ref: artStatuses[index % artStatuses.length] === "Approved" ? "artwork/on-file.pdf" : null,
      rib_lr: true,
      toe: true,
      pattern: false,
      signature: false,
      foot_text: null,
      sort_order: index,
    } as ProductionPlanItem;
  });

  console.log(`Inserting ${itemRows.length} plan line items…`);
  const { error: itemsError } = await supabase.from("production_plan_items").insert(itemRows);
  if (itemsError) throw itemsError;

  const products = selected.map((entry) => entry.product);

  function buildEngineInput(overrides: {
    plan: ProductionPlan;
    items: ProductionPlanItem[];
    simulationVersion: number;
  }): ProductionSimulationEngineInput {
    return {
      plan: overrides.plan,
      items: overrides.items,
      products,
      vendor,
      eventsByProductId,
      purchaseOrders,
      lineItemsByPo,
      capacitySnapshots,
      simulationVersion: overrides.simulationVersion,
    };
  }

  const scenarios: Array<{ name: string; plan: ProductionPlan; items: ProductionPlanItem[] }> = [
    { name: "Recommended Plan", plan: savedPlan as ProductionPlan, items: itemRows },
    {
      name: "Conservative Plan",
      plan: { ...(savedPlan as ProductionPlan), coverage_target_days: 30 },
      items: itemRows.map((item) => ({ ...item, planned_quantity: Math.max(Math.round(item.planned_quantity * 0.6), item.moq ?? 0) })),
    },
    {
      name: "Aggressive Growth Plan",
      plan: { ...(savedPlan as ProductionPlan), coverage_target_days: 60 },
      items: itemRows.map((item) => ({ ...item, planned_quantity: Math.round(item.planned_quantity * 1.5) })),
    },
  ];

  let activeRunId: string | null = null;
  console.log("Running the real simulation engine for each scenario…");
  for (const [index, scenario] of scenarios.entries()) {
    const simulationVersion = index + 1;
    const engineInput = buildEngineInput({ plan: scenario.plan, items: scenario.items, simulationVersion });
    const result = runProductionSimulation(engineInput);
    result.recommendations = generateRecommendations(result, scenario.plan);

    const runRow = {
      id: randomUUID(),
      plan_id: savedPlan.id,
      scenario_name: scenario.name,
      simulation_version: simulationVersion,
      input_snapshot: {
        plan: scenario.plan,
        items: scenario.items,
        vendor,
        capacitySnapshots,
        generatedAt: result.generatedAt,
      },
      result_snapshot: result,
      recommendations: result.recommendations,
      is_stale: false,
    };

    const { data: savedRunRows, error: runError } = await supabase.from("production_simulation_runs").insert(runRow).select();
    if (runError) throw runError;
    const savedRun = savedRunRows![0] as ProductionSimulationRun;
    console.log(
      `  ${scenario.name}: ${result.summary.totalPlannedUnits} units, $${result.summary.totalEstimatedCost.toFixed(2)}, ` +
      `${result.summary.skusWithStockoutRisk} SKU(s) at stockout risk, ${result.recommendations.length} recommendation(s).`,
    );

    if (index === 0) activeRunId = savedRun.id;
  }

  const { error: updateError } = await supabase
    .from("production_plans")
    .update({ status: "Simulated", active_simulation_run_id: activeRunId })
    .eq("id", savedPlan.id);
  if (updateError) throw updateError;

  console.log("\nDone. Open the plan at:");
  console.log(`  /production/planner/${savedPlan.id}`);
}

void main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
