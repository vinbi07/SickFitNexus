export type CalendarEventCategory =
  | "purchase_order"
  | "invoice"
  | "production"
  | "inventory"
  | "retailer"
  | "compliance"
  | "lookbook"
  | "manual";

export type CalendarEventStatus =
  | "overdue"
  | "at_risk"
  | "due_soon"
  | "waiting"
  | "blocked"
  | "completed"
  | "scheduled";

export type CalendarView = "month" | "week" | "agenda";

/**
 * A source date field is only ever written back to via calendarService.rescheduleSourceDate,
 * and only when isEditableDate is true — this keeps drag/drop reschedule scoped to a
 * single whitelisted column per category, never a cascading multi-field update.
 */
export interface CalendarEvent {
  id: string;
  category: CalendarEventCategory;
  title: string;
  date: string;
  status: CalendarEventStatus;
  priority: "low" | "medium" | "high" | null;
  isAutomaticallyGenerated: boolean;
  isEditableDate: boolean;
  sourceType: string | null;
  sourceId: string | null;
  sourceHref: string | null;
  sourceDateField: string | null;
  retailerId: string | null;
  retailerName: string | null;
  manufacturerId: string | null;
  manufacturerName: string | null;
  productId: string | null;
  productName: string | null;
  ownerLabel: string | null;
  amount: number | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface CalendarFilterState {
  categories: CalendarEventCategory[];
  statuses: CalendarEventStatus[];
  ownerLabel: string | null;
  retailerId: string | null;
  manufacturerId: string | null;
  productId: string | null;
  priority: Array<"low" | "medium" | "high">;
  overdueOnly: boolean;
  needsActionOnly: boolean;
  generatedFilter: "all" | "automatic" | "manual";
}

export const DEFAULT_CALENDAR_CATEGORIES: CalendarEventCategory[] = [
  "purchase_order",
  "invoice",
  "production",
  "retailer",
  "lookbook",
];

export const DEFAULT_CALENDAR_FILTERS: CalendarFilterState = {
  categories: DEFAULT_CALENDAR_CATEGORIES,
  statuses: [],
  ownerLabel: null,
  retailerId: null,
  manufacturerId: null,
  productId: null,
  priority: [],
  overdueOnly: false,
  needsActionOnly: false,
  generatedFilter: "all",
};

export const CALENDAR_EVENT_CATEGORIES: CalendarEventCategory[] = [
  "purchase_order",
  "invoice",
  "production",
  "inventory",
  "retailer",
  "compliance",
  "lookbook",
  "manual",
];

export const CALENDAR_EVENT_STATUSES: CalendarEventStatus[] = [
  "overdue",
  "at_risk",
  "due_soon",
  "waiting",
  "blocked",
  "completed",
  "scheduled",
];

export const CALENDAR_CATEGORY_LABELS: Record<CalendarEventCategory, string> = {
  purchase_order: "Purchase Order",
  invoice: "Invoice",
  production: "Production",
  inventory: "Inventory",
  retailer: "Retailer",
  compliance: "Compliance",
  lookbook: "Lookbook",
  manual: "Manual",
};

export const CALENDAR_STATUS_LABELS: Record<CalendarEventStatus, string> = {
  overdue: "Overdue",
  at_risk: "At Risk",
  due_soon: "Due Soon",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
  scheduled: "Scheduled",
};

/** Manual calendar_events row shape, mirrors src/db/migrations/030_calendar_events.sql */
export interface ManualCalendarEventRow {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  category: string;
  status: string;
  priority: string | null;
  owner_label: string | null;
  retailer_id: string | null;
  vendor_id: string | null;
  product_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_by_user_id: string | null;
  created_by_label: string | null;
  created_at: string;
  updated_at: string;
}
