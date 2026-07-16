import { useEffect, useState, type ReactNode } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { InfoTooltip } from "@/components/Tooltip";
import type { Location, ProductionPlan, Vendor } from "@/types/domain";

const GOAL_OPTIONS: Array<{ label: string; value: ProductionPlan["goal"] }> = [
  { label: "Restock", value: "restock" },
  { label: "Retailer Launch", value: "retailer_launch" },
  { label: "Seasonal Build", value: "seasonal_build" },
  { label: "Emergency Recovery", value: "emergency_recovery" },
  { label: "Custom", value: "custom" },
];

const DEMAND_METHOD_OPTIONS: Array<{ label: string; value: ProductionPlan["demand_method"] }> = [
  { label: "Average Daily Usage (all history)", value: "avg_daily_usage" },
  { label: "Trailing 30 Days", value: "trailing_30d" },
  { label: "Trailing 90 Days", value: "trailing_90d" },
  { label: "Manual Override", value: "manual_override" },
];

const GOAL_LABEL = new Map(GOAL_OPTIONS.map((option) => [option.value, option.label]));
const DEMAND_METHOD_LABEL = new Map(DEMAND_METHOD_OPTIONS.map((option) => [option.value, option.label]));

type Step = {
  key: string;
  label: string;
  description: string;
};

const STEPS: Step[] = [
  { key: "basics", label: "Basics", description: "Name this plan, pick a goal, and leave any context notes." },
  { key: "manufacturer", label: "Manufacturer & Location", description: "Who is making this run, and where the stock is headed." },
  { key: "timeline", label: "Timeline", description: "The window this plan simulates over, and the key production dates." },
  { key: "demand", label: "Demand & Coverage", description: "How demand is forecast and how much coverage the run should target." },
  { key: "review", label: "Review", description: "Double-check everything before running the simulation." },
];

const FIELD_STEP: Partial<Record<keyof ProductionPlan, number>> = {
  name: 0,
  goal: 0,
  notes: 0,
  vendor_id: 1,
  location_id: 1,
  production_lane: 1,
  horizon_start: 2,
  horizon_end: 2,
  planned_order_date: 2,
  target_arrival_date: 2,
  production_week: 2,
  demand_method: 3,
  coverage_target_days: 3,
  safety_stock_override: 3,
  include_allocated: 3,
  include_existing_incoming: 3,
};

export function PlanAssumptionsWizard({
  plan,
  updatePlanField,
  vendors,
  locations,
  fieldErrors,
}: {
  plan: ProductionPlan;
  updatePlanField: <K extends keyof ProductionPlan>(key: K, value: ProductionPlan[K]) => void;
  vendors: Vendor[];
  locations: Location[];
  fieldErrors?: Partial<Record<keyof ProductionPlan, string>>;
}) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = STEPS[activeStepIndex];

  const vendorName = vendors.find((vendor) => vendor.id === plan.vendor_id)?.name ?? "Unassigned";
  const locationName = locations.find((location) => location.id === plan.location_id)?.name ?? "Unassigned";

  const goToStep = (index: number) => setActiveStepIndex(Math.max(0, Math.min(STEPS.length - 1, index)));

  const errorSteps = new Set(
    Object.keys(fieldErrors ?? {})
      .map((key) => FIELD_STEP[key as keyof ProductionPlan])
      .filter((step): step is number => step != null),
  );

  useEffect(() => {
    if (!errorSteps.size) return;
    goToStep(Math.min(...errorSteps));
    // Only jump when the set of errored fields changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(fieldErrors ?? {})]);

  const fieldError = (key: keyof ProductionPlan) => fieldErrors?.[key];

  return (
    <div className="panel section-stack">
      <div className="panel-header"><h3>Plan Assumptions</h3></div>

      <div className="wizard-steps" role="tablist" aria-label="Plan assumption steps">
        {STEPS.map((step, index) => (
          <button
            key={step.key}
            type="button"
            role="tab"
            aria-selected={index === activeStepIndex}
            className={`wizard-step${index === activeStepIndex ? " is-active" : ""}${index < activeStepIndex ? " is-done" : ""}`}
            onClick={() => goToStep(index)}
          >
            <span className="wizard-step-number">{index + 1}</span>
            <span className="wizard-step-label">{step.label}</span>
            {errorSteps.has(index) ? <span className="wizard-step-error-dot" title="This step has an issue to fix">!</span> : null}
          </button>
        ))}
      </div>

      <p className="helper-text wizard-step-description">{activeStep.description}</p>

      <div className="wizard-step-panel">
        {activeStep.key === "basics" ? (
          <div className="form-grid">
            <div className={`field field-wide${fieldError("name") ? " has-error" : ""}`}>
              <label>
                Plan Name
                <InfoTooltip content="A short, memorable name for this production run, e.g. 'Fall Restock — Crew Socks'." />
              </label>
              <input value={plan.name} onChange={(event) => updatePlanField("name", event.target.value)} />
              {fieldError("name") ? <span className="field-error">{fieldError("name")}</span> : null}
            </div>
            <div className="field">
              <label>
                Goal
                <InfoTooltip content="What this run is for. Goal doesn't change the math, but helps the team filter and prioritize plans." />
              </label>
              <select value={plan.goal} onChange={(event) => updatePlanField("goal", event.target.value as ProductionPlan["goal"])}>
                {GOAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field field-wide">
              <label>
                Notes
                <InfoTooltip content="Any context worth leaving for whoever reviews or approves this plan." />
              </label>
              <textarea rows={3} value={plan.notes ?? ""} onChange={(event) => updatePlanField("notes", event.target.value || null)} />
            </div>
          </div>
        ) : null}

        {activeStep.key === "manufacturer" ? (
          <div className="form-grid">
            <div className="field">
              <label>
                Manufacturer
                <InfoTooltip content="Who will produce this run. Required before this plan can be approved and converted to a Manufacturer PO." />
              </label>
              <select
                value={plan.vendor_id ?? ""}
                onChange={(event) => updatePlanField("vendor_id", event.target.value || null)}
              >
                <option value="">Unassigned</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Location
                <InfoTooltip content="The warehouse or location this run's inventory should be received into." />
              </label>
              <select
                value={plan.location_id ?? ""}
                onChange={(event) => updatePlanField("location_id", event.target.value || null)}
              >
                <option value="">Unassigned</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Production Lane
                <InfoTooltip content="An optional label for the manufacturing line, factory floor, or workflow lane handling this run." />
              </label>
              <input value={plan.production_lane ?? ""} onChange={(event) => updatePlanField("production_lane", event.target.value || null)} />
            </div>
          </div>
        ) : null}

        {activeStep.key === "timeline" ? (
          <div className="form-grid">
            <DatePickerField
              label="Horizon Start"
              required
              value={plan.horizon_start}
              onChange={(value) => updatePlanField("horizon_start", value ?? plan.horizon_start)}
              tooltip="The first day the simulation projects inventory from."
              error={fieldError("horizon_start")}
            />
            <DatePickerField
              label="Horizon End"
              required
              value={plan.horizon_end}
              minDate={plan.horizon_start}
              onChange={(value) => updatePlanField("horizon_end", value ?? plan.horizon_end)}
              tooltip="The last day the simulation projects inventory through."
              error={fieldError("horizon_end")}
            />
            <DatePickerField
              label="Planned Order Date"
              value={plan.planned_order_date}
              onChange={(value) => updatePlanField("planned_order_date", value)}
              tooltip="When you expect to place the Manufacturer PO for this run."
            />
            <DatePickerField
              label="Target Arrival Date"
              value={plan.target_arrival_date}
              minDate={plan.planned_order_date}
              onChange={(value) => updatePlanField("target_arrival_date", value)}
              tooltip="When this run needs to land in inventory. Drives the schedule chart and stockout-gap checks."
            />
            <DatePickerField
              label="Production Week"
              value={plan.production_week}
              onChange={(value) => updatePlanField("production_week", value)}
              tooltip="The week production is expected to run — used to bucket this plan into manufacturer capacity."
            />
          </div>
        ) : null}

        {activeStep.key === "demand" ? (
          <div className="form-grid">
            <div className="field">
              <label>
                Demand Method
                <InfoTooltip content="How daily demand is estimated for every SKU in this plan — a longer trailing window smooths out spikes, a shorter one reacts faster to recent trends." />
              </label>
              <select value={plan.demand_method} onChange={(event) => updatePlanField("demand_method", event.target.value as ProductionPlan["demand_method"])}>
                {DEMAND_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Coverage Target (days)
                <InfoTooltip content="How many days of demand the proposed production should cover once it lands, on top of safety stock." />
              </label>
              <input
                type="number"
                min={0}
                value={plan.coverage_target_days}
                onChange={(event) => updatePlanField("coverage_target_days", Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label>
                Safety Stock Override
                <InfoTooltip content="Leave blank to use each SKU's calculated safety stock, or set a fixed unit count to apply to every SKU in this plan instead." />
              </label>
              <input
                type="number"
                min={0}
                value={plan.safety_stock_override ?? ""}
                placeholder="Use calculated safety stock"
                onChange={(event) => updatePlanField("safety_stock_override", event.target.value ? Number(event.target.value) : null)}
              />
            </div>
            <div className="field">
              <label className="wizard-checkbox-label">
                <input
                  type="checkbox"
                  checked={plan.include_allocated}
                  onChange={(event) => updatePlanField("include_allocated", event.target.checked)}
                />
                Include Allocated Inventory
                <InfoTooltip content="When on, units already allocated to other orders are subtracted from what's available before projecting this run's impact." />
              </label>
            </div>
            <div className="field">
              <label className="wizard-checkbox-label">
                <input
                  type="checkbox"
                  checked={plan.include_existing_incoming}
                  onChange={(event) => updatePlanField("include_existing_incoming", event.target.checked)}
                />
                Include Existing Incoming Orders
                <InfoTooltip content="When on, receipts already on order from prior POs count toward projected availability instead of assuming a clean slate." />
              </label>
            </div>
          </div>
        ) : null}

        {activeStep.key === "review" ? (
          <div className="wizard-review-grid">
            <ReviewGroup title="Basics" onEdit={() => goToStep(0)}>
              <ReviewRow label="Plan Name" value={plan.name} />
              <ReviewRow label="Goal" value={GOAL_LABEL.get(plan.goal) ?? plan.goal} />
              <ReviewRow label="Notes" value={plan.notes || "—"} />
            </ReviewGroup>
            <ReviewGroup title="Manufacturer & Location" onEdit={() => goToStep(1)}>
              <ReviewRow label="Manufacturer" value={vendorName} />
              <ReviewRow label="Location" value={locationName} />
              <ReviewRow label="Production Lane" value={plan.production_lane || "—"} />
            </ReviewGroup>
            <ReviewGroup title="Timeline" onEdit={() => goToStep(2)}>
              <ReviewRow label="Horizon" value={`${plan.horizon_start} → ${plan.horizon_end}`} />
              <ReviewRow label="Planned Order Date" value={plan.planned_order_date || "—"} />
              <ReviewRow label="Target Arrival Date" value={plan.target_arrival_date || "—"} />
              <ReviewRow label="Production Week" value={plan.production_week || "—"} />
            </ReviewGroup>
            <ReviewGroup title="Demand & Coverage" onEdit={() => goToStep(3)}>
              <ReviewRow label="Demand Method" value={DEMAND_METHOD_LABEL.get(plan.demand_method) ?? plan.demand_method} />
              <ReviewRow label="Coverage Target" value={`${plan.coverage_target_days} days`} />
              <ReviewRow label="Safety Stock Override" value={plan.safety_stock_override != null ? String(plan.safety_stock_override) : "Calculated"} />
              <ReviewRow label="Include Allocated Inventory" value={plan.include_allocated ? "Yes" : "No"} />
              <ReviewRow label="Include Existing Incoming Orders" value={plan.include_existing_incoming ? "Yes" : "No"} />
            </ReviewGroup>
          </div>
        ) : null}
      </div>

      <div className="btn-row wizard-nav">
        <button type="button" className="btn btn-ghost" disabled={activeStepIndex === 0} onClick={() => goToStep(activeStepIndex - 1)}>
          Back
        </button>
        <button type="button" className="btn btn-secondary" disabled={activeStepIndex === STEPS.length - 1} onClick={() => goToStep(activeStepIndex + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

function ReviewGroup({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="wizard-review-group">
      <div className="wizard-review-group-header">
        <strong>{title}</strong>
        <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>Edit</button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="wizard-review-row">
      <span className="helper-text">{label}</span>
      <span>{value}</span>
    </div>
  );
}
