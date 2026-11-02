import type { PurchaseOrder } from "@/types/domain";
import {
  diffInDays,
  expectedMilestones,
  type LeadTimeSettings,
  type ShipMode,
  type ShutdownWindow,
} from "@/utils/leadTime";

export const PRODUCTION_STAGES = [
  "Sent to vendor",
  "Paid",
  "In production",
  "Packing",
  "Shipped",
  "Labels created",
  "At US port",
  "Received",
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number];

/**
 * Stages that can be skipped. US delivery labels are made by the freight
 * forwarder for air and some sea shipments, but not every order has them.
 */
export const OPTIONAL_STAGES = new Set<ProductionStage>(["Labels created"]);

/** Display name for a stage where the stored key reads awkwardly. */
export function stageLabel(stage: ProductionStage) {
  return stage === "Labels created" ? "US labels created" : stage;
}

/** Stages whose date lives in an existing purchase_orders column and is set by its own flow. */
export const STAGE_OWNED_FIELD: Partial<Record<ProductionStage, keyof PurchaseOrder>> = {
  Paid: "invoice_paid_at",
  Shipped: "ship_date",
  Received: "actual_delivery_date",
};

const CLOSED_STATUSES = new Set(["Received", "Closed", "Cancelled", "Fulfilled"]);
const WATCHED_STAGES: ProductionStage[] = ["Packing", "Shipped", "At US port", "Received"];
const SOON_DAYS = 5;

type StagePo = Pick<
  PurchaseOrder,
  "status" | "order_date" | "invoice_paid_at" | "ship_date" | "actual_delivery_date" | "total_cost" | "total_units"
> & {
  ship_mode?: ShipMode | null;
  freight_cost?: number | null;
  stage_dates?: Partial<Record<ProductionStage, string>> | null;
};

export interface StageContext {
  settings: LeadTimeSettings;
  shutdowns: ShutdownWindow[];
  today: string;
}

export interface StageAlert {
  severity: "late" | "soon";
  stage: ProductionStage;
  expected: string;
  days: number;
  message: string;
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

export function shipModeOf(po: StagePo): ShipMode {
  return po.ship_mode === "Air" ? "Air" : "Sea";
}

/** Actual date for each stage, preferring the dedicated PO columns over stage_dates. */
export function stageDates(po: StagePo): Record<ProductionStage, string | null> {
  const stored = po.stage_dates ?? {};
  return {
    "Sent to vendor": dateOnly(stored["Sent to vendor"]) ?? dateOnly(po.order_date),
    Paid: dateOnly(po.invoice_paid_at) ?? dateOnly(stored.Paid),
    "In production": dateOnly(stored["In production"]),
    Packing: dateOnly(stored.Packing),
    Shipped: dateOnly(po.ship_date) ?? dateOnly(stored.Shipped),
    "Labels created": dateOnly(stored["Labels created"]),
    "At US port": dateOnly(stored["At US port"]),
    Received: dateOnly(po.actual_delivery_date) ?? dateOnly(stored.Received),
  };
}

/** Index of the furthest stage reached, or -1 when nothing has happened yet. */
export function currentStageIndex(po: StagePo) {
  const dates = stageDates(po);
  let index = -1;
  PRODUCTION_STAGES.forEach((stage, i) => {
    if (dates[stage]) index = i;
  });
  return index;
}

export function currentStage(po: StagePo): ProductionStage | null {
  const index = currentStageIndex(po);
  return index >= 0 ? PRODUCTION_STAGES[index] : null;
}

export function nextStage(po: StagePo): ProductionStage | null {
  return PRODUCTION_STAGES[currentStageIndex(po) + 1] ?? null;
}

/** Stages that can be marked next: the next one, plus the one after it when the next is optional. */
export function nextStageOptions(po: StagePo): ProductionStage[] {
  const index = currentStageIndex(po);
  const next = PRODUCTION_STAGES[index + 1];
  if (!next) return [];
  const after = PRODUCTION_STAGES[index + 2];
  return OPTIONAL_STAGES.has(next) && after ? [next, after] : [next];
}

/** Expected dates for the later stages, counted from the Paid date. Null until paid. */
export function expectedStageDates(po: StagePo, context: Pick<StageContext, "settings" | "shutdowns">) {
  const paid = stageDates(po).Paid;
  if (!paid) return null;
  const milestones = expectedMilestones(paid, shipModeOf(po), context.settings, context.shutdowns);
  return {
    expected: {
      "In production": milestones.inProduction,
      Packing: milestones.packing,
      Shipped: milestones.shipped,
      "At US port": milestones.atUsPort,
      Received: milestones.received,
    } as Partial<Record<ProductionStage, string>>,
    shutdownsApplied: milestones.shutdownsApplied,
  };
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const SOON_LABEL: Partial<Record<ProductionStage, string>> = {
  Packing: "About to be packed",
  Shipped: "About to ship",
  "At US port": "About to land",
  Received: "About to arrive",
};

/**
 * The single most pressing timing alert for a factory order: the first stage
 * not yet reached that is late, or due within five days.
 */
export function stageAlert(po: StagePo, context: StageContext): StageAlert | null {
  if (CLOSED_STATUSES.has(po.status)) return null;
  const projection = expectedStageDates(po, context);
  if (!projection) return null;
  const index = currentStageIndex(po);

  for (const stage of WATCHED_STAGES) {
    if (index >= PRODUCTION_STAGES.indexOf(stage)) continue;
    const expected = projection.expected[stage];
    if (!expected) return null;
    const days = diffInDays(expected, context.today);
    if (days < 0) {
      return { severity: "late", stage, expected, days: -days, message: `${stage} ${plural(-days, "day")} late` };
    }
    if (days <= SOON_DAYS) {
      const when = days === 0 ? "today" : `in ${plural(days, "day")}`;
      return { severity: "soon", stage, expected, days, message: `${SOON_LABEL[stage]} ${when}` };
    }
    return null;
  }
  return null;
}

/** Short "what happens next" text for list views. */
export function nextStepLabel(po: StagePo, context: StageContext) {
  if (CLOSED_STATUSES.has(po.status)) return null;
  const alert = stageAlert(po, context);
  if (alert) return { tone: alert.severity, text: alert.message, expected: alert.expected };
  const next = nextStage(po);
  if (!next) return null;
  const expected = expectedStageDates(po, context)?.expected[next] ?? null;
  return { tone: "neutral" as const, text: next === "Paid" ? "Waiting on payment" : `${stageLabel(next)} next`, expected };
}

export function landedCostPerPair(po: StagePo) {
  const units = Number(po.total_units ?? 0);
  if (!units) return null;
  return (Number(po.total_cost ?? 0) + Number(po.freight_cost ?? 0)) / units;
}

/** Freight difference if the order had gone the other way. Null when rates are not set. */
export function freightModeComparison(
  po: StagePo,
  rates: { sea_rate_per_pair: number | null; air_rate_per_pair: number | null },
) {
  const units = Number(po.total_units ?? 0);
  const sea = rates.sea_rate_per_pair;
  const air = rates.air_rate_per_pair;
  if (!units || sea == null || air == null) return null;
  const mode = shipModeOf(po);
  return {
    label: mode === "Air" ? "Sea would save" : "Air would cost",
    amount: Math.abs(air - sea) * units,
  };
}
