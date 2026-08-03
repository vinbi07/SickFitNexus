import { daysBetween } from "@/utils/date";
import type { CalendarEvent, CalendarEventStatus } from "@/lib/calendar/calendarTypes";

/**
 * Single source of truth for date-driven status. All adapters and UI must call
 * this rather than re-deriving overdue/at-risk/due-soon day math themselves.
 */
export function computeDateStatus(params: {
  date: string | null;
  today: string;
  isTerminal: boolean;
  overdueThresholdDays?: number;
  atRiskThresholdDays?: number;
  dueSoonThresholdDays?: number;
}): CalendarEventStatus {
  const {
    date,
    today,
    isTerminal,
    overdueThresholdDays = 0,
    atRiskThresholdDays = 3,
    dueSoonThresholdDays = 7,
  } = params;

  if (isTerminal) return "completed";
  if (!date) return "scheduled";

  const daysUntil = daysBetween(today, date);

  if (daysUntil < overdueThresholdDays) return "overdue";
  if (daysUntil <= atRiskThresholdDays) return "at_risk";
  if (daysUntil <= dueSoonThresholdDays) return "due_soon";
  return "scheduled";
}

export function isNeedsAction(event: CalendarEvent): boolean {
  if (event.status === "overdue" || event.status === "at_risk") return true;
  if (event.status === "waiting" || event.status === "blocked") return true;
  if (event.status === "due_soon" && event.priority === "high") return true;
  return false;
}

const NEXT_ACTION_BY_CATEGORY_STATUS: Partial<Record<string, string>> = {
  "purchase_order:overdue": "Follow up with the manufacturer on the delayed delivery.",
  "purchase_order:at_risk": "Confirm ship date is still on track before it slips.",
  "purchase_order:waiting": "Review and approve this purchase order.",
  "purchase_order:blocked": "Resolve the hold or issue flagged on this order.",
  "invoice:overdue": "Send a payment reminder or confirm payment status.",
  "invoice:due_soon": "Confirm invoice was sent and payment is on track.",
  "invoice:waiting": "Send this invoice to the customer.",
  "production:overdue": "Update the plan's dates or escalate the delay.",
  "production:at_risk": "Review the plan — it needs attention before proceeding.",
  "production:waiting": "Finish planning and move this out of Draft.",
  "inventory:overdue": "This product is out of stock — reorder immediately.",
  "inventory:at_risk": "Place a reorder before this product runs out.",
  "inventory:due_soon": "Plan a reorder for this product soon.",
  "retailer:due_soon": "Prepare for the upcoming reorder window.",
  "retailer:waiting": "Reach out during the open reorder window.",
  "compliance:overdue": "Request an updated compliance document immediately.",
  "compliance:at_risk": "Request a renewed document before it expires.",
  "compliance:due_soon": "Plan ahead for this upcoming expiration.",
  "lookbook:overdue": "This buyer's ordering link has expired — issue a new one.",
  "lookbook:at_risk": "Renew this buyer's ordering link before it expires.",
};

export function getRecommendedNextAction(event: CalendarEvent): string | null {
  if (event.status === "completed") return null;
  return NEXT_ACTION_BY_CATEGORY_STATUS[`${event.category}:${event.status}`] ?? null;
}
