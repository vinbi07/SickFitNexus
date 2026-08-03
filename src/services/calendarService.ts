import { assertSupabase } from "@/lib/supabase";
import { deleteFromTable, insertTable, updateTable } from "@/services/baseService";
import { dashboardSessionService } from "@/services/dashboardSessionService";
import { productionPlanService } from "@/services/productionPlanService";
import { purchaseOrderService } from "@/services/purchaseOrderService";
import type { CalendarEvent } from "@/lib/calendar/calendarTypes";
import type { ManualCalendarEventRow } from "@/lib/calendar/calendarTypes";

export const calendarService = {
  async listManualEvents() {
    const supabase = assertSupabase();
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("event_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ManualCalendarEventRow[];
  },

  async createManualEvent(payload: Partial<ManualCalendarEventRow>) {
    const actor = await dashboardSessionService.getCurrentUser().catch(() => null);
    const [saved] = (await insertTable<ManualCalendarEventRow>("calendar_events", {
      ...payload,
      category: "manual",
      created_by_user_id: actor?.id ?? null,
      created_by_label: actor?.display_name || actor?.email || payload.owner_label || null,
    })) as ManualCalendarEventRow[];
    return saved;
  },

  async updateManualEvent(id: string, patch: Partial<ManualCalendarEventRow>) {
    return updateTable<ManualCalendarEventRow>("calendar_events", id, patch);
  },

  async deleteManualEvent(id: string) {
    await deleteFromTable("calendar_events", id);
  },

  async rescheduleManualEvent(id: string, newDate: string) {
    return updateTable<ManualCalendarEventRow>("calendar_events", id, { event_date: newDate });
  },

  /**
   * Single-field, single-record reschedule for source records — never cascades to
   * dependent dates. Only ever called when event.isEditableDate is true.
   */
  async rescheduleSourceDate(event: CalendarEvent, newDate: string) {
    if (!event.isEditableDate || !event.sourceId || !event.sourceDateField) {
      throw new Error("This event's date cannot be rescheduled from the calendar.");
    }

    if (event.sourceType === "purchase_order") {
      return purchaseOrderService.updateGeneralInfo(event.sourceId, {
        [event.sourceDateField]: newDate,
      });
    }

    if (event.sourceType === "production_plan") {
      const plan = await productionPlanService.getById(event.sourceId);
      return productionPlanService.upsert(
        { ...plan, [event.sourceDateField]: newDate },
        plan.items,
      );
    }

    throw new Error("Rescheduling is not supported for this event type.");
  },
};
