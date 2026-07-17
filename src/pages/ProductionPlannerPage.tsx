import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable } from "@/components/DataTable";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { InfoTooltip } from "@/components/Tooltip";
import { useAsyncData } from "@/hooks/useAsyncData";
import { dashboardService } from "@/services/dashboardService";
import { inventoryService } from "@/services/inventoryService";
import { productionPlanService } from "@/services/productionPlanService";
import { retailerService } from "@/services/retailerService";
import { supportService } from "@/services/supportService";
import { vendorTestProductionPlanService } from "@/services/vendorTestProductionPlanService";
import { vendorService } from "@/services/vendorService";
import type { ProductionPlan, ProductionPlanStatus } from "@/types/domain";
import { calculateForecastMetric } from "@/utils/forecasting";
import { formatDate } from "@/utils/format";

const PLAN_STATUSES: ProductionPlanStatus[] = ["Draft", "Simulated", "Needs Review", "Approved", "Converted", "Cancelled", "Archived"];

export function ProductionPlannerPage() {
  const navigate = useNavigate();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: ReactNode } | null>(null);
  const [deleting, setDeleting] = useState<ProductionPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFromReorderQueue, setCreatingFromReorderQueue] = useState(false);
  const [generatingVendorPlans, setGeneratingVendorPlans] = useState(false);
  const [selectedRetailerId, setSelectedRetailerId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductionPlanStatus | "">("");
  const { data, loading, error, reload } = useAsyncData(
    async () => ({
      plans: await productionPlanService.list(),
      vendors: await vendorService.list(),
      retailers: await retailerService.list(),
    }),
    [],
  );

  if (loading) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? "Unable to load production plans"} />;

  const filteredPlans = data.plans.filter((plan) => {
    if (statusFilter && plan.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const needle = search.trim().toLowerCase();
    return plan.name.toLowerCase().includes(needle) || (plan.vendors?.name ?? "").toLowerCase().includes(needle);
  });

  const handleCreateBlank = async () => {
    try {
      setCreating(true);
      const today = new Date();
      const horizonEnd = new Date(today.getTime() + 60 * 86_400_000);
      const created = await productionPlanService.upsert(
        {
          name: "Untitled Plan",
          goal: "restock",
          status: "Draft",
          source_type: "blank",
          horizon_start: today.toISOString().slice(0, 10),
          horizon_end: horizonEnd.toISOString().slice(0, 10),
        },
        [],
      );
      navigate(`/production/planner/${created.id}`);
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to create plan." });
    } finally {
      setCreating(false);
    }
  };

  const handleStartFromReorderQueue = async () => {
    try {
      setCreatingFromReorderQueue(true);
      const [snapshot, products, events] = await Promise.all([
        dashboardService.getSnapshot(),
        supportService.listProducts(),
        inventoryService.listEvents(),
      ]);

      const attentionSkus = snapshot.skuReorderWindows.filter(
        (item) => !item.recommendation.startsWith("Watch manually") && item.recommendation !== "Monitor window",
      );
      if (!attentionSkus.length) {
        setNotice({ tone: "error", message: "No SKUs currently need attention in the reorder queue." });
        return;
      }

      const productsBySku = new Map(products.map((product) => [product.sku, product]));
      const vendorsById = new Map(data.vendors.map((vendor) => [vendor.id, vendor]));

      const items = attentionSkus
        .map((item) => {
          const product = productsBySku.get(item.sku);
          if (!product) return null;
          const vendor = product.vendor_id ? vendorsById.get(product.vendor_id) : null;
          const productEvents = events.filter((event) => event.product_id === product.id);
          const forecast = calculateForecastMetric(product, productEvents, vendor?.lead_time_days ?? 21);
          return {
            product_id: product.id,
            planned_quantity: forecast.suggestedReorderQuantity,
            unit_cost: product.unit_cost,
          };
        })
        .filter((item): item is { product_id: string; planned_quantity: number; unit_cost: number } => item !== null);

      if (!items.length) {
        setNotice({ tone: "error", message: "Reorder queue SKUs could not be matched to product records." });
        return;
      }

      const today = new Date();
      const horizonEnd = new Date(today.getTime() + 60 * 86_400_000);
      const created = await productionPlanService.upsert(
        {
          name: `Reorder Queue Restock - ${formatDate(today.toISOString())}`,
          goal: "restock",
          status: "Draft",
          source_type: "reorder_queue",
          horizon_start: today.toISOString().slice(0, 10),
          horizon_end: horizonEnd.toISOString().slice(0, 10),
        },
        items,
      );
      navigate(`/production/planner/${created.id}`);
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to start plan from reorder queue." });
    } finally {
      setCreatingFromReorderQueue(false);
    }
  };

  const handleGenerateVendorTestPlans = async () => {
    try {
      if (!selectedRetailerId) {
        setNotice({ tone: "error", message: "Select an account before generating a test production plan." });
        return;
      }

      setGeneratingVendorPlans(true);
      const result = await vendorTestProductionPlanService.generate(selectedRetailerId);
      await reload();

      if (!result.generated.length) {
        setNotice({
          tone: "error",
          message: result.skipped[0]?.reason ?? "No vendor test plan was generated for the selected vendor.",
        });
        return;
      }

      const generated = result.generated[0];
      const fallbackCount = new Set(result.generated.flatMap((entry) => entry.fallbackLabels)).size;
      setNotice({
        tone: "success",
        message: (
          <>
            Account test production plan {generated.action}.
            {result.protectedPlanCount ? ` ${result.protectedPlanCount} approved/converted test plan(s) for this account were left untouched.` : " "}
            {fallbackCount ? ` ${fallbackCount} fallback value note(s) were recorded. ` : " "}
            Open: <Link className="table-link" to={`/production/planner/${generated.plan.id}`}>{generated.plan.name}</Link>
          </>
        ),
      });
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to generate vendor test plans." });
    } finally {
      setGeneratingVendorPlans(false);
    }
  };

  const handleDuplicate = async (plan: ProductionPlan) => {
    try {
      const full = await productionPlanService.getById(plan.id);
      const created = await productionPlanService.upsert(
        {
          name: `${plan.name} (Copy)`,
          goal: plan.goal,
          status: "Draft",
          vendor_id: plan.vendor_id,
          location_id: plan.location_id,
          horizon_start: plan.horizon_start,
          horizon_end: plan.horizon_end,
          planned_order_date: plan.planned_order_date,
          target_arrival_date: plan.target_arrival_date,
          production_lane: plan.production_lane,
          production_week: plan.production_week,
          demand_method: plan.demand_method,
          coverage_target_days: plan.coverage_target_days,
          safety_stock_override: plan.safety_stock_override,
          include_allocated: plan.include_allocated,
          include_existing_incoming: plan.include_existing_incoming,
          source_type: "duplicate",
          source_plan_id: plan.id,
        },
        full.items.map((item) => ({ ...item, id: undefined })),
      );
      navigate(`/production/planner/${created.id}`);
    } catch (err) {
      setNotice({ tone: "error", message: err instanceof Error ? err.message : "Unable to duplicate plan." });
    }
  };

  return (
    <div className="section-stack">
      <PageHeader
        title="Production Planner"
        description="Build and simulate a proposed production run before committing to a Manufacturer PO. Simulations never change inventory, allocations, capacity, or purchase orders."
        actions={
          <div className="section-stack" style={{ alignItems: "flex-end", gap: 10 }}>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => navigate("/production/templates")}>
                Manage Templates
              </button>
            </div>
            <div className="btn-row" style={{ alignItems: "flex-end" }}>
              <div className="section-stack" style={{ gap: 4 }}>
                <span className="helper-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  Blank plan
                  <InfoTooltip content="Start with an empty plan and add products manually." />
                </span>
                <button className="btn btn-primary" disabled={creating} onClick={() => void handleCreateBlank()}>
                  {creating ? "Creating..." : "New Plan"}
                </button>
              </div>
              <div className="section-stack" style={{ gap: 4 }}>
                <span className="helper-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  From reorder queue
                  <InfoTooltip content="Auto-fills a plan with every SKU the reorder queue currently flags as needing attention." />
                </span>
                <button className="btn btn-secondary" disabled={creatingFromReorderQueue} onClick={() => void handleStartFromReorderQueue()}>
                  {creatingFromReorderQueue ? "Building..." : "Start From Reorder Queue"}
                </button>
              </div>
              <div className="section-stack" style={{ gap: 4 }}>
                <span className="helper-text" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  From an account
                  <InfoTooltip content="Generates a test production plan matching a specific account's typical order, for you to review before using it." />
                </span>
                <div className="btn-row">
                  <select
                    aria-label="Account for test production plan"
                    value={selectedRetailerId}
                    onChange={(event) => setSelectedRetailerId(event.target.value)}
                  >
                    <option value="">Select account</option>
                    {data.retailers.map((retailer) => (
                      <option key={retailer.id} value={retailer.id}>{retailer.name}</option>
                    ))}
                  </select>
                  <button
                    className="btn btn-secondary"
                    disabled={generatingVendorPlans || !selectedRetailerId}
                    title={!selectedRetailerId ? "Select an account first" : undefined}
                    onClick={() => void handleGenerateVendorTestPlans()}
                  >
                    {generatingVendorPlans ? "Generating..." : "Generate"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
      />
      {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}
      <div className="panel section-stack">
        <div className="panel-header">
          <h3>Plans</h3>
          <div className="btn-row">
            <input
              type="search"
              aria-label="Search plans"
              placeholder="Search by plan name or manufacturer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 240 }}
            />
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ProductionPlanStatus | "")}
            >
              <option value="">All statuses</option>
              {PLAN_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        </div>
        <DataTable
          emptyMessage={
            data.plans.length
              ? "No plans match your search or filter."
              : "No production plans yet. Create a blank plan, or start from a template or the reorder queue."
          }
          columns={[
            {
              key: "name",
              title: "Plan",
              render: (row) => (
                <div className="cell-stack">
                  <strong>{row.name}</strong>
                  <span className="helper-text">{row.goal.replace(/_/g, " ")}</span>
                </div>
              ),
            },
            { key: "status", title: "Status", render: (row) => <StatusBadge label={row.status} /> },
            {
              key: "vendor",
              title: "Manufacturer",
              render: (row) => row.vendors?.name ?? "Unassigned",
            },
            {
              key: "horizon",
              title: "Horizon",
              render: (row) => `${formatDate(row.horizon_start)} - ${formatDate(row.horizon_end)}`,
            },
            {
              key: "arrival",
              title: "Target Arrival",
              render: (row) => (row.target_arrival_date ? formatDate(row.target_arrival_date) : "Not set"),
            },
            { key: "updated_at", title: "Last Updated", render: (row) => formatDate(row.updated_at) },
            {
              key: "actions",
              title: "Actions",
              render: (row) => (
                <div className="btn-row">
                  <button className="btn btn-ghost btn-small" onClick={() => navigate(`/production/planner/${row.id}`)}>
                    Open
                  </button>
                  <button className="btn btn-secondary btn-small" onClick={() => void handleDuplicate(row)}>
                    Duplicate
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => setDeleting(row)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={filteredPlans}
        />
      </div>
      {deleting ? (
        <ConfirmDialog
          title="Delete production plan?"
          message={`This will remove "${deleting.name}" and its simulation history. Manufacturer POs already converted from this plan are not affected.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await productionPlanService.remove(deleting.id);
            setDeleting(null);
            await reload();
            setNotice({ tone: "success", message: "Plan deleted." });
          }}
        />
      ) : null}
    </div>
  );
}
