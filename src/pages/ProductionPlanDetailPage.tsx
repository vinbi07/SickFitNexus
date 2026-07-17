import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DashboardCard } from "@/components/DashboardCard";
import { DataTable } from "@/components/DataTable";
// import { EntityFormModal } from "@/components/EntityFormModal"; // Specs editing temporarily disabled — see docs/production-planner-specs-deferred.md
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { CapacityUtilizationChart } from "@/components/production/CapacityUtilizationChart";
import { CoverageComparisonChart } from "@/components/production/CoverageComparisonChart";
import { InventoryProjectionChart } from "@/components/production/InventoryProjectionChart";
import { PlanAssumptionsWizard } from "@/components/production/PlanAssumptionsWizard";
import { ProductionMixChart } from "@/components/production/ProductionMixChart";
import { ProductionScheduleChart } from "@/components/production/ProductionScheduleChart";
import { ProductPickerCombobox } from "@/components/production/ProductPickerCombobox";
import { ProductPlanItemRow } from "@/components/production/ProductPlanItemRow";
import { SimulationRecommendationPanel } from "@/components/production/SimulationRecommendationPanel";
import { SkuRiskMatrix } from "@/components/production/SkuRiskMatrix";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listTable } from "@/services/baseService";
import { productionPlanService } from "@/services/productionPlanService";
import { productionSimulationService } from "@/services/productionSimulationService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import { supportService } from "@/services/supportService";
import { vendorService } from "@/services/vendorService";
import type { Location, ProductionPlan, ProductionPlanItem, ProductionRecommendation, ProductionSimulationRun, PurchaseOrder } from "@/types/domain";
import { addDays } from "@/utils/date";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { describeSaveError, validateProductionPlanDraft, type ItemErrorField } from "@/utils/productionPlanValidation";
import { roundToMoqIncrement } from "@/utils/productionSimulation";

type DraftItem = Partial<ProductionPlanItem> & { product_id: string };

const CHART_TABS = [
  { key: "overview", label: "Overview" },
  { key: "coverage", label: "Coverage & Capacity" },
  { key: "schedule", label: "Schedule" },
  { key: "risk", label: "Risk & Cost" },
  { key: "sku", label: "SKU Detail" },
] as const;

type ChartTabKey = (typeof CHART_TABS)[number]["key"];

export function ProductionPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: ReactNode } | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingProductId, setAddingProductId] = useState("");
  const [planFieldErrors, setPlanFieldErrors] = useState<Partial<Record<keyof ProductionPlan, string>>>({});
  const [itemFieldErrors, setItemFieldErrors] = useState<Record<string, Partial<Record<ItemErrorField, string>>>>({});
  const [removingItem, setRemovingItem] = useState<DraftItem | null>(null);
  // const [editingSpecItem, setEditingSpecItem] = useState<DraftItem | null>(null); // Specs editing temporarily disabled — see docs/production-planner-specs-deferred.md

  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      plan: await productionPlanService.getById(id as string),
      vendors: await vendorService.list(),
      locations: await listTable<Location>("locations"),
      products: await supportService.listProducts(),
      runs: await productionSimulationService.listRuns(id as string),
      linkedPos: await purchaseOrderService.list({ search: undefined }).then((all) => all.filter((po) => po.source_production_plan_id === id)),
    }),
    [id],
  );

  const [draftPlan, setDraftPlan] = useState<ProductionPlan | null>(null);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [dirtySinceRun, setDirtySinceRun] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [viewedRunId, setViewedRunId] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertedPos, setConvertedPos] = useState<PurchaseOrder[]>([]);
  const [activeChartTab, setActiveChartTab] = useState<ChartTabKey>("overview");
  const [editSectionOpen, setEditSectionOpen] = useState(true);
  const hasAutoCollapsedRef = useRef(false);

  useEffect(() => {
    if (!data) return;
    setDraftPlan(data.plan);
    setDraftItems(data.plan.items ?? []);
  }, [data?.plan.id]);

  const plan = draftPlan;
  const items = draftItems;

  const productsById = useMemo(() => new Map((data?.products ?? []).map((product) => [product.id, product])), [data]);

  // Computed before the loading/error guards (rather than further down with the other
  // derived values) purely so the auto-collapse effect below — a hook, which must run
  // unconditionally on every render — has a stable, already-known `result` to react to.
  const activeRun: ProductionSimulationRun | null = data
    ? ((viewedRunId ? data.runs.find((run) => run.id === viewedRunId) : null) ??
      data.runs.find((run) => run.id === data.plan.active_simulation_run_id) ??
      data.runs[0] ??
      null)
    : null;
  const result = activeRun?.result_snapshot ?? null;

  // Collapse the edit section the first time a plan already has a simulation result to
  // review (e.g. returning to an existing plan) — but only once, so it never fights a
  // manual expand/collapse the user makes afterward (e.g. after running a later simulation).
  useEffect(() => {
    if (!hasAutoCollapsedRef.current && result) {
      setEditSectionOpen(false);
      hasAutoCollapsedRef.current = true;
    }
  }, [result]);

  if (loading) return <LoadingState />;
  if (error || !data || !plan) return <ErrorState message={error ?? "Unable to load this production plan"} />;

  const updatePlanField = <K extends keyof ProductionPlan>(key: K, value: ProductionPlan[K]) => {
    setDraftPlan((current) => (current ? { ...current, [key]: value } : current));
    setDirtySinceRun(true);
  };

  const updateItemField = (productId: string, key: keyof ProductionPlanItem, value: unknown) => {
    setDraftItems((current) => current.map((item) => (item.product_id === productId ? { ...item, [key]: value } : item)));
    setDirtySinceRun(true);
  };

  const handleAddProduct = (productId: string = addingProductId) => {
    if (!productId) return;
    if (draftItems.some((item) => item.product_id === productId)) {
      setNotice({ tone: "error", message: "That product is already in this plan." });
      return;
    }
    const product = productsById.get(productId);
    setDraftItems((current) => [
      ...current,
      {
        product_id: productId,
        planned_quantity: 0,
        moq: null,
        order_increment: null,
        unit_cost: product?.unit_cost ?? null,
        pack_pairs: 1,
        rib_lr: true,
        toe: true,
        pattern: false,
        signature: false,
        cards_used: 0,
        barcode_required: false,
        sort_order: current.length,
        products: product ?? null,
      } as DraftItem,
    ]);
    setAddingProductId("");
    setDirtySinceRun(true);
  };

  const handleRemoveItem = (productId: string) => {
    setDraftItems((current) => current.filter((item) => item.product_id !== productId));
    setDirtySinceRun(true);
  };

  const handleSave = async () => {
    const { planErrors, itemErrors } = validateProductionPlanDraft(plan, draftItems);

    if (planErrors.length || itemErrors.length) {
      setPlanFieldErrors(Object.fromEntries(planErrors.map((error) => [error.field, error.message])));
      setItemFieldErrors(
        itemErrors.reduce<Record<string, Partial<Record<ItemErrorField, string>>>>((acc, error) => {
          acc[error.productId] = { ...acc[error.productId], [error.field]: error.message };
          return acc;
        }, {}),
      );
      setNotice({
        tone: "error",
        message: (
          <div>
            <strong>Fix the following before saving:</strong>
            <ul className="notice-error-list">
              {[...planErrors, ...itemErrors].map((error, index) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </div>
        ),
      });
      return null;
    }

    setPlanFieldErrors({});
    setItemFieldErrors({});

    try {
      setSaving(true);
      const saved = await productionPlanService.upsert(plan, draftItems);
      setDraftPlan(saved);
      setDraftItems(saved.items ?? []);
      setNotice({ tone: "success", message: "Plan saved." });
      return saved;
    } catch (err) {
      setNotice({ tone: "error", message: describeSaveError(err) });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleRunSimulation = async () => {
    try {
      setSimulating(true);
      const saved = await handleSave();
      if (!saved) return;
      const label = scenarioName.trim() || `Scenario ${(data?.runs.length ?? 0) + 1}`;
      const run = await productionSimulationService.runSimulation(saved.id, label);
      // Patch the fields runSimulation just changed server-side so a later handleSave()
      // (e.g. from Convert) doesn't overwrite them with the stale pre-run draft values.
      setDraftPlan((current) => (current ? { ...current, status: "Simulated", active_simulation_run_id: run.id } : current));
      setDirtySinceRun(false);
      setScenarioName("");
      setViewedRunId(null);
      await reload();
      setNotice({ tone: "success", message: `Simulation "${label}" complete.` });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to run simulation." });
    } finally {
      setSimulating(false);
    }
  };

  const handleSetActiveRun = async (runId: string) => {
    try {
      await productionSimulationService.setActiveRun(id as string, runId);
      setDraftPlan((current) => (current ? { ...current, active_simulation_run_id: runId } : current));
      await reload();
      setNotice({ tone: "success", message: "Active scenario updated." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to switch scenario." });
    }
  };

  const handleApprove = async () => {
    try {
      setApproving(true);
      await productionPlanService.updateStatus(id as string, "Approved");
      setDraftPlan((current) => (current ? { ...current, status: "Approved", approved_at: new Date().toISOString() } : current));
      await reload();
      setNotice({ tone: "success", message: "Plan approved. It can now be converted to a Manufacturer PO." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to approve plan." });
    } finally {
      setApproving(false);
    }
  };

  const handleConvert = async (run: ProductionSimulationRun) => {
    try {
      setConverting(true);
      const saved = await handleSave();
      if (!saved) return;
      const pos = await productionPlanService.convertToManufacturerPO({ plan: saved, items: saved.items ?? [], run });
      setConvertedPos(pos);
      setDraftPlan((current) => (current ? { ...current, status: "Converted" } : current));
      await reload();
      setNotice({ tone: "success", message: "Converted to a Manufacturer PO." });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to convert this plan." });
    } finally {
      setConverting(false);
    }
  };

  /**
   * Applies a bounded, deterministic edit to the draft plan/items for the recommendation's
   * quick action, then leaves it to the user to review and re-run the simulation — quick
   * actions never auto-save or auto-simulate, keeping the human in control of the change.
   */
  const handleQuickAction = (rec: ProductionRecommendation) => {
    if (!rec.quickAction) return;
    const affected = new Set(rec.affectedProductIds);

    switch (rec.quickAction.type) {
      case "adjust_quantity": {
        setDraftItems((current) =>
          current.map((item) => {
            if (!affected.has(item.product_id)) return item;
            const rounded = roundToMoqIncrement(item.planned_quantity ?? 0, item.moq, item.order_increment);
            const bumped = rounded > (item.planned_quantity ?? 0) ? rounded : Math.ceil((item.planned_quantity ?? 0) * 1.2);
            return { ...item, planned_quantity: bumped };
          }),
        );
        setDirtySinceRun(true);
        setNotice({ tone: "success", message: "Increased planned quantity for affected SKUs. Re-run the simulation to see the effect." });
        break;
      }
      case "reduce_quantity": {
        setDraftItems((current) =>
          current.map((item) =>
            affected.has(item.product_id)
              ? { ...item, planned_quantity: Math.max(Math.floor((item.planned_quantity ?? 0) * 0.75), 0) }
              : item,
          ),
        );
        setDirtySinceRun(true);
        setNotice({ tone: "success", message: "Reduced planned quantity for affected SKUs. Re-run the simulation to see the effect." });
        break;
      }
      case "move_order_date": {
        setDraftPlan((current) => {
          if (!current?.planned_order_date) return current;
          return { ...current, planned_order_date: addDays(new Date(`${current.planned_order_date}T00:00:00`), -14).toISOString().slice(0, 10) };
        });
        setDirtySinceRun(true);
        setNotice({ tone: "success", message: "Moved the planned order date 14 days earlier. Re-run the simulation to see the effect." });
        break;
      }
      case "split_manufacturer": {
        setNotice({ tone: "error", message: "Splitting a run across manufacturers isn't supported yet — adjust the production week or reduce quantities manually." });
        break;
      }
    }
  };

  const handleDismissRecommendation = async (activeRunId: string, recommendationId: string, note: string) => {
    try {
      await productionSimulationService.updateRecommendation(activeRunId, recommendationId, { isDismissed: true, dismissNote: note || null });
      await reload();
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to dismiss recommendation." });
    }
  };

  const totalPlannedUnits = items.reduce((sum, item) => sum + Number(item.planned_quantity ?? 0), 0);
  const totalEstimatedCost = items.reduce(
    (sum, item) => sum + Number(item.planned_quantity ?? 0) * Number(item.unit_cost ?? 0),
    0,
  );

  const availableProducts = (data.products ?? []).filter((product) => !items.some((item) => item.product_id === product.id));

  // Workflow state (status, active scenario) is read from the freshly loaded `data.plan`
  // rather than the editable `draftPlan` mirror, since actions like Approve/Set Active
  // mutate it server-side directly and only `reload()` — not the id-keyed draft-sync
  // effect — picks that up. Only the editable form fields come from `plan`/`draftPlan`.
  // (`activeRun`/`result` themselves are computed earlier, above the loading/error guards.)
  const isStale = dirtySinceRun || Boolean(activeRun?.is_stale);
  const selectedSku = result?.skuResults.find((sku) => sku.productId === selectedProductId) ?? null;
  const scenarioScore = (run: ProductionSimulationRun) =>
    run.result_snapshot.summary.skusWithStockoutRisk * 100_000 +
    run.result_snapshot.summary.capacityConflictCount * 50_000 +
    run.result_snapshot.summary.totalEstimatedCost;
  const recommendedRunId = data.runs.length
    ? [...data.runs].sort((a, b) => scenarioScore(a) - scenarioScore(b))[0].id
    : null;

  const canApprove =
    (data.plan.status === "Draft" || data.plan.status === "Simulated" || data.plan.status === "Needs Review") &&
    Boolean(result) &&
    !isStale &&
    result?.summary.readinessBlockerCount === 0 &&
    activeRun?.id === data.plan.active_simulation_run_id;
  const canConvert = data.plan.status === "Approved" && Boolean(activeRun) && !isStale;
  const linkedPos = [...data.linkedPos, ...convertedPos.filter((po) => !data.linkedPos.some((existing) => existing.id === po.id))];

  const jumpToOverview = (productId: string | null) => {
    setSelectedProductId(productId);
    setActiveChartTab("overview");
  };

  const editSection = (
    <details className="collapsible-section" open={editSectionOpen} onToggle={(event) => setEditSectionOpen(event.currentTarget.open)}>
      <summary className="collapsible-section-summary">Edit Plan Assumptions &amp; Products</summary>
      <div className="collapsible-section-body section-stack">
        <PlanAssumptionsWizard
          plan={plan}
          updatePlanField={updatePlanField}
          vendors={data.vendors}
          locations={data.locations}
          fieldErrors={planFieldErrors}
        />

        <div className="panel section-stack">
          <div className="panel-header">
            <h3>Products &amp; Planned Quantities</h3>
            <div className="btn-row">
              <ProductPickerCombobox
                products={availableProducts}
                value={addingProductId}
                onChange={(productId) => { setAddingProductId(productId); handleAddProduct(productId); }}
              />
            </div>
          </div>
          {items.length ? (
            <div className="plan-item-list">
              {items.map((item) => {
                const product = item.products ?? productsById.get(item.product_id);
                return (
                  <ProductPlanItemRow
                    key={item.product_id}
                    item={item}
                    product={product}
                    onUpdateField={updateItemField}
                    // onEditSpecs={() => setEditingSpecItem(item)} // Specs editing temporarily disabled — see docs/production-planner-specs-deferred.md
                    onRemove={() => setRemovingItem(item)}
                    fieldErrors={itemFieldErrors[item.product_id]}
                  />
                );
              })}
            </div>
          ) : (
            <div className="empty-state">No products added yet. Add products above to start building this run.</div>
          )}
        </div>
      </div>
    </details>
  );

  const resultsSection = (
    <div className="panel section-stack">
      <div className="panel-header">
        <h3>Simulation Results</h3>
        {activeRun ? <span className="helper-text">Version {activeRun.simulation_version} · {formatDate(activeRun.result_snapshot.generatedAt)}</span> : null}
      </div>
      {!result ? (
        <div className="empty-state">
          {!plan.vendor_id ? "Select a manufacturer, " : ""}
          {!plan.target_arrival_date ? "set a target arrival date, " : ""}
          Run a simulation to see projected inventory impact, coverage, capacity, schedule, risk, and cost.
        </div>
      ) : (
        <div className="section-stack">
          {isStale ? (
            <NotificationBanner
              tone="error"
              message="This plan has changed since the last simulation. Results below may be stale — run the simulation again."
            />
          ) : null}

          <div className="card-grid">
            <DashboardCard label="Units Proposed" value={formatNumber(result.summary.totalPlannedUnits)} />
            <DashboardCard label="Estimated Cost" value={formatCurrency(result.summary.totalEstimatedCost)} />
            <DashboardCard label="SKUs With Stockout Risk" value={result.summary.skusWithStockoutRisk} />
            <DashboardCard label="Capacity Conflicts" value={result.summary.capacityConflictCount} />
            <DashboardCard label="Readiness Blockers" value={result.summary.readinessBlockerCount} />
            <DashboardCard label="Avg. Ending Coverage" value={`${formatNumber(result.summary.averageEndingCoverageDaysAfter)}d`} />
          </div>

          {data.runs.length > 1 ? (
            <div className="panel section-stack">
              <div className="panel-header"><h3>Scenario Comparison</h3></div>
              <DataTable
                emptyMessage="No saved scenarios yet."
                columns={[
                  {
                    key: "scenario",
                    title: "Scenario",
                    render: (row) => (
                      <div className="cell-stack">
                        <strong>{row.scenario_name}</strong>
                        <span className="helper-text">
                          v{row.simulation_version}{row.id === recommendedRunId ? " · Recommended" : ""}{row.is_stale ? " · Stale" : ""}
                        </span>
                      </div>
                    ),
                  },
                  { key: "units", title: "Units", render: (row) => formatNumber(row.result_snapshot.summary.totalPlannedUnits) },
                  { key: "cost", title: "Cost", render: (row) => formatCurrency(row.result_snapshot.summary.totalEstimatedCost) },
                  { key: "stockouts", title: "Stockout Risk SKUs", render: (row) => row.result_snapshot.summary.skusWithStockoutRisk },
                  { key: "capacity", title: "Capacity Conflicts", render: (row) => row.result_snapshot.summary.capacityConflictCount },
                  { key: "coverage", title: "Avg Coverage After", render: (row) => `${formatNumber(row.result_snapshot.summary.averageEndingCoverageDaysAfter)}d` },
                  {
                    key: "actions",
                    title: "Actions",
                    render: (row) => (
                      <div className="btn-row">
                        <button className="btn btn-ghost btn-small" onClick={() => setViewedRunId(row.id)}>
                          View
                        </button>
                        <button
                          className="btn btn-secondary btn-small"
                          disabled={row.id === data.plan.active_simulation_run_id}
                          onClick={() => void handleSetActiveRun(row.id)}
                        >
                          {row.id === data.plan.active_simulation_run_id ? "Active" : "Set Active"}
                        </button>
                      </div>
                    ),
                  },
                ]}
                rows={data.runs}
              />
            </div>
          ) : null}

          <div className="production-results-layout">
            <div className="production-results-main section-stack">
              <div className="wizard-steps" role="tablist" aria-label="Simulation chart views">
                {CHART_TABS.map((tab, index) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={activeChartTab === tab.key}
                    className={`wizard-step${activeChartTab === tab.key ? " is-active" : ""}`}
                    onClick={() => setActiveChartTab(tab.key)}
                  >
                    <span className="wizard-step-number">{index + 1}</span>
                    <span className="wizard-step-label">{tab.label}</span>
                  </button>
                ))}
              </div>

              {activeChartTab === "overview" ? (
                <div className="section-stack">
                  {selectedSku ? (
                    <div className="btn-row">
                      <button className="btn btn-ghost btn-small" onClick={() => setSelectedProductId(null)}>
                        ← Back to Overview (all SKUs)
                      </button>
                    </div>
                  ) : null}
                  <InventoryProjectionChart
                    title={selectedSku ? `Inventory Projection - ${selectedSku.productName}` : "Inventory Projection: Baseline vs Proposed Run"}
                    series={selectedSku ? selectedSku.dailySeries : result.dailyPortfolioSeries}
                    targetArrivalDate={plan.target_arrival_date}
                  />
                </div>
              ) : null}

              {activeChartTab === "coverage" ? (
                <div className="split-grid">
                  <CoverageComparisonChart skuResults={result.skuResults} />
                  <CapacityUtilizationChart buckets={result.capacitySeries} />
                </div>
              ) : null}

              {activeChartTab === "schedule" ? (
                <ProductionScheduleChart
                  title="Production Schedule"
                  milestones={result.scheduleMilestones}
                  requiredArrivalDate={plan.target_arrival_date}
                />
              ) : null}

              {activeChartTab === "risk" ? (
                <div className="split-grid">
                  <SkuRiskMatrix points={result.riskMatrix} selectedProductId={selectedProductId} onSelect={jumpToOverview} />
                  <ProductionMixChart costMix={result.costMix} />
                </div>
              ) : null}

              {activeChartTab === "sku" ? (
                <div className="panel section-stack">
                  <div className="panel-header">
                    <h3>SKU Detail</h3>
                    {selectedProductId ? (
                      <button className="btn btn-ghost btn-small" onClick={() => setSelectedProductId(null)}>Clear filter</button>
                    ) : null}
                  </div>
                  <DataTable
                    emptyMessage="No SKU results yet."
                    columns={[
                      { key: "sku", title: "SKU", render: (row) => <div className="cell-stack"><strong>{row.productName}</strong><span className="helper-text">{row.sku}</span></div> },
                      { key: "planned", title: "Planned", render: (row) => formatNumber(row.roundedQuantity) },
                      { key: "cost", title: "Est. Cost", render: (row) => formatCurrency(row.estimatedCost) },
                      { key: "coverageBefore", title: "Coverage Before", render: (row) => `${formatNumber(row.daysOfSupplyBefore)}d` },
                      { key: "coverageAfter", title: "Coverage After", render: (row) => `${formatNumber(row.daysOfSupplyAfter)}d` },
                      { key: "stockout", title: "Stockout Days", render: (row) => row.stockoutDayCountProposed },
                      { key: "risk", title: "Risk", render: (row) => (row.isSlowMoverRisk ? "Slow mover" : row.isOverproductionRisk ? "Overproduced" : row.stockoutDayCountProposed > 0 ? "Stockout risk" : "On track") },
                    ]}
                    rows={selectedProductId ? result.skuResults.filter((row) => row.productId === selectedProductId) : result.skuResults}
                    onRowClick={(row) => setSelectedProductId(row.productId)}
                  />
                </div>
              ) : null}
            </div>

            <SimulationRecommendationPanel
              recommendations={result.recommendations}
              onSelect={(productIds) => jumpToOverview(productIds[0] ?? null)}
              onDismiss={activeRun ? (recommendationId, note) => void handleDismissRecommendation(activeRun.id, recommendationId, note) : undefined}
              onQuickAction={handleQuickAction}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="section-stack">
      <PageHeader
        title={plan.name}
        description="Configure this plan's assumptions and product mix. Nothing here changes inventory, allocations, capacity, or purchase orders until you approve and convert the plan."
        actions={
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => navigate("/production/planner")}>
              Back to Plans
            </button>
            <button className="btn btn-secondary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? "Saving..." : "Save Plan"}
            </button>
            <input
              placeholder={`Scenario ${(data.runs.length ?? 0) + 1}`}
              value={scenarioName}
              onChange={(event) => setScenarioName(event.target.value)}
              style={{ width: 160 }}
            />
            <button className="btn btn-primary" disabled={simulating || saving} onClick={() => void handleRunSimulation()}>
              {simulating ? "Simulating..." : "Run Simulation"}
            </button>
            {data.plan.status !== "Approved" && data.plan.status !== "Converted" ? (
              <button
                className="btn btn-secondary"
                disabled={!canApprove || approving}
                title={!canApprove ? "Run a current, non-stale simulation with zero readiness blockers first" : undefined}
                onClick={() => void handleApprove()}
              >
                {approving ? "Approving..." : "Approve Plan"}
              </button>
            ) : null}
            {data.plan.status === "Approved" ? (
              <button
                className="btn btn-primary"
                disabled={!canConvert || converting}
                onClick={() => activeRun && void handleConvert(activeRun)}
              >
                {converting ? "Converting..." : "Convert to Manufacturer PO"}
              </button>
            ) : null}
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      {linkedPos.length ? (
        <NotificationBanner
          tone="success"
          message={
            <>
              Converted to Manufacturer PO(s):{" "}
              {linkedPos.map((po, index) => (
                <span key={po.id}>
                  {index > 0 ? ", " : ""}
                  <Link className="table-link" to={`/purchase-orders/${po.id}`}>{po.po_number}</Link>
                </span>
              ))}
            </>
          }
          onClose={() => setConvertedPos([])}
        />
      ) : null}

      {!result ? (
        <div className="card-grid">
          <DashboardCard label="Planned Units" value={totalPlannedUnits} />
          <DashboardCard label="Estimated Cost" value={formatCurrency(totalEstimatedCost)} />
          <DashboardCard label="SKUs in Plan" value={items.length} />
        </div>
      ) : null}

      {result ? (
        <>
          {resultsSection}
          {editSection}
        </>
      ) : (
        <>
          {editSection}
          {resultsSection}
        </>
      )}

      {removingItem ? (
        <ConfirmDialog
          title="Remove product from plan?"
          message={`This will remove "${(removingItem.products ?? productsById.get(removingItem.product_id))?.name ?? removingItem.product_id}" and its planned quantity from this plan. Nothing outside this plan is affected.`}
          onClose={() => setRemovingItem(null)}
          onConfirm={() => {
            handleRemoveItem(removingItem.product_id);
            setRemovingItem(null);
          }}
        />
      ) : null}

      {/* Specs editing temporarily disabled — see docs/production-planner-specs-deferred.md
      {editingSpecItem ? (
        <EntityFormModal<Record<string, unknown>>
          title={`Manufacturing Specs - ${(editingSpecItem.products ?? productsById.get(editingSpecItem.product_id))?.name ?? ""}`}
          saveLabel="Save Specs"
          initialValues={{
            sock_card_id: editingSpecItem.sock_card_id ?? "",
            pack_pairs: editingSpecItem.pack_pairs ?? 1,
            sock_size: editingSpecItem.sock_size ?? "",
            construction: editingSpecItem.construction ?? "",
            cards_used: editingSpecItem.cards_used ?? 0,
            box_no: editingSpecItem.box_no ?? "",
            pantone: editingSpecItem.pantone ?? "",
            barcode_required: editingSpecItem.barcode_required ?? false,
            art_status: editingSpecItem.art_status ?? "",
            art_note: editingSpecItem.art_note ?? "",
            mockup_file_ref: editingSpecItem.mockup_file_ref ?? "",
            artwork_file_ref: editingSpecItem.artwork_file_ref ?? "",
            rib_lr: editingSpecItem.rib_lr ?? true,
            toe: editingSpecItem.toe ?? true,
            pattern: editingSpecItem.pattern ?? false,
            signature: editingSpecItem.signature ?? false,
            foot_text: editingSpecItem.foot_text ?? "",
          }}
          fields={[
            { key: "sock_card_id", label: "Sock Card ID" },
            { key: "pack_pairs", label: "Pack Pairs", type: "number", min: 1, step: 1 },
            { key: "sock_size", label: "Size" },
            { key: "construction", label: "Construction" },
            { key: "cards_used", label: "Cards Used", type: "number", min: 0, step: 1 },
            { key: "box_no", label: "Box Number" },
            { key: "pantone", label: "Pantone" },
            { key: "barcode_required", label: "Barcode Required", type: "checkbox" },
            {
              key: "art_status",
              label: "Art Status",
              type: "select",
              options: [
                { label: "Not Started", value: "Not Started" },
                { label: "In Progress", value: "In Progress" },
                { label: "Approved", value: "Approved" },
              ],
            },
            { key: "art_note", label: "Art Note", type: "textarea" },
            { key: "mockup_file_ref", label: "Mockup File Reference" },
            { key: "artwork_file_ref", label: "Artwork File Reference" },
            { key: "rib_lr", label: "Rib L/R", type: "checkbox" },
            { key: "toe", label: "Toe", type: "checkbox" },
            { key: "pattern", label: "Pattern", type: "checkbox" },
            { key: "signature", label: "Signature", type: "checkbox" },
            { key: "foot_text", label: "Foot Text" },
          ]}
          onSave={async (values) => {
            Object.entries(values).forEach(([key, value]) => {
              updateItemField(editingSpecItem.product_id, key as keyof ProductionPlanItem, value);
            });
          }}
          onClose={() => setEditingSpecItem(null)}
        />
      ) : null}
      */}
    </div>
  );
}
