import type { ProductionPlan, ProductionPlanItem } from "@/types/domain";

export interface PlanFieldError {
  field: keyof ProductionPlan;
  message: string;
}

export type ItemErrorField = "planned_quantity" | "moq" | "order_increment" | "unit_cost";

export interface ItemFieldError {
  productId: string;
  field: ItemErrorField;
  message: string;
}

export interface PlanValidationResult {
  planErrors: PlanFieldError[];
  itemErrors: ItemFieldError[];
}

type PlanItemLike = Partial<ProductionPlanItem> & { product_id: string };

/**
 * Mirrors the actual DB constraints in 028_production_planner.sql so a save that would be
 * rejected by Postgres is caught client-side first, with a plain-English, field-level message.
 */
export function validateProductionPlanDraft(plan: ProductionPlan, items: PlanItemLike[]): PlanValidationResult {
  const planErrors: PlanFieldError[] = [];

  if (!plan.name || !plan.name.trim()) {
    planErrors.push({ field: "name", message: "Plan Name is required." });
  }
  if (!plan.horizon_start) {
    planErrors.push({ field: "horizon_start", message: "Horizon Start is required." });
  }
  if (!plan.horizon_end) {
    planErrors.push({ field: "horizon_end", message: "Horizon End is required." });
  }
  if (plan.horizon_start && plan.horizon_end && plan.horizon_end < plan.horizon_start) {
    planErrors.push({ field: "horizon_end", message: "Horizon End must be on or after Horizon Start." });
  }

  const itemErrors: ItemFieldError[] = [];
  for (const item of items) {
    const productLabel = item.products?.name ?? item.product_id;
    if (item.planned_quantity != null && Number(item.planned_quantity) < 0) {
      itemErrors.push({ productId: item.product_id, field: "planned_quantity", message: `${productLabel}: Planned Qty cannot be negative.` });
    }
    if (item.moq != null && Number(item.moq) < 0) {
      itemErrors.push({ productId: item.product_id, field: "moq", message: `${productLabel}: MOQ cannot be negative.` });
    }
    if (item.order_increment != null && Number(item.order_increment) < 0) {
      itemErrors.push({ productId: item.product_id, field: "order_increment", message: `${productLabel}: Increment cannot be negative.` });
    }
    if (item.unit_cost != null && Number(item.unit_cost) < 0) {
      itemErrors.push({ productId: item.product_id, field: "unit_cost", message: `${productLabel}: Unit Cost cannot be negative.` });
    }
  }

  return { planErrors, itemErrors };
}

const KNOWN_ERROR_PATTERNS: Array<{ test: RegExp; describe: (match: RegExpMatchArray) => string }> = [
  {
    test: /column "([^"]+)".*violates not-null constraint/i,
    describe: (match) => `${humanizeColumn(match[1])} is required.`,
  },
  {
    test: /violates check constraint "production_plans_horizon_check"/i,
    describe: () => "Horizon End must be on or after Horizon Start.",
  },
  {
    test: /violates check constraint "production_plan_items_quantity_check"/i,
    describe: () => "Planned Qty cannot be negative.",
  },
  {
    test: /duplicate key value violates unique constraint/i,
    describe: () => "That product is already in this plan.",
  },
  {
    test: /violates foreign key constraint/i,
    describe: () => "One of the selected values (e.g. manufacturer, location, or product) no longer exists — refresh and try again.",
  },
];

function humanizeColumn(column: string): string {
  return column
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Supabase/Postgrest errors are plain objects ({ message, details, hint, code }),
  // not Error instances — read .message off them directly rather than stringifying the object.
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error);
}

/**
 * Best-effort translation of a raw Postgres/Supabase error into a plain-English sentence.
 * Never hides an unrecognized error — falls back to the original message untouched.
 */
export function describeSaveError(error: unknown): string {
  const rawMessage = extractErrorMessage(error);
  for (const pattern of KNOWN_ERROR_PATTERNS) {
    const match = rawMessage.match(pattern.test);
    if (match) return pattern.describe(match);
  }
  return rawMessage || "Unable to save plan.";
}
