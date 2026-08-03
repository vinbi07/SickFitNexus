import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_CALENDAR_CATEGORIES,
  DEFAULT_CALENDAR_FILTERS,
  type CalendarEvent,
  type CalendarEventCategory,
  type CalendarEventStatus,
  type CalendarFilterState,
  type CalendarView,
} from "@/lib/calendar/calendarTypes";
import { isNeedsAction } from "@/lib/calendar/calendarStatus";
import { toDateInput } from "@/utils/date";

const FILTER_PARAM_KEYS = [
  "categories",
  "statuses",
  "owner",
  "retailer",
  "manufacturer",
  "product",
  "priority",
  "overdueOnly",
  "needsAction",
  "generated",
] as const;

function parseListParam<T extends string>(value: string | null): T[] {
  if (!value) return [];
  return value.split(",").filter(Boolean) as T[];
}

export function matchesCalendarFilters(event: CalendarEvent, filters: CalendarFilterState): boolean {
  if (filters.categories.length && !filters.categories.includes(event.category)) return false;
  if (filters.statuses.length && !filters.statuses.includes(event.status)) return false;
  if (filters.ownerLabel && event.ownerLabel !== filters.ownerLabel) return false;
  if (filters.retailerId && event.retailerId !== filters.retailerId) return false;
  if (filters.manufacturerId && event.manufacturerId !== filters.manufacturerId) return false;
  if (filters.productId && event.productId !== filters.productId) return false;
  if (filters.priority.length && (!event.priority || !filters.priority.includes(event.priority))) return false;
  if (filters.overdueOnly && event.status !== "overdue") return false;
  if (filters.needsActionOnly && !isNeedsAction(event)) return false;
  if (filters.generatedFilter === "automatic" && !event.isAutomaticallyGenerated) return false;
  if (filters.generatedFilter === "manual" && event.isAutomaticallyGenerated) return false;
  return true;
}

export function filterCalendarEvents(events: CalendarEvent[], filters: CalendarFilterState): CalendarEvent[] {
  return events.filter((event) => matchesCalendarFilters(event, filters));
}

export function useCalendarFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const view = (searchParams.get("view") as CalendarView) || "month";
  const anchorDate = searchParams.get("date") || toDateInput(new Date());

  const filters: CalendarFilterState = useMemo(() => {
    const categoriesParam = searchParams.get("categories");
    return {
      // Absent param = untouched default view; present-but-empty = user explicitly cleared every category.
      categories: categoriesParam === null
        ? DEFAULT_CALENDAR_CATEGORIES
        : parseListParam<CalendarEventCategory>(categoriesParam),
      statuses: parseListParam<CalendarEventStatus>(searchParams.get("statuses")),
      ownerLabel: searchParams.get("owner"),
      retailerId: searchParams.get("retailer"),
      manufacturerId: searchParams.get("manufacturer"),
      productId: searchParams.get("product"),
      priority: parseListParam<"low" | "medium" | "high">(searchParams.get("priority")),
      overdueOnly: searchParams.get("overdueOnly") === "1",
      needsActionOnly: searchParams.get("needsAction") === "1",
      generatedFilter: (searchParams.get("generated") as CalendarFilterState["generatedFilter"]) || "all",
    };
  }, [searchParams]);

  const setView = useCallback(
    (nextView: CalendarView) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.set("view", nextView);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setAnchorDate = useCallback(
    (date: string) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          next.set("date", date);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setFilters = useCallback(
    (patch: Partial<CalendarFilterState>) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          const merged: CalendarFilterState = { ...filters, ...patch };

          // Always set (never delete) so an explicit "clear all categories" persists
          // instead of silently reverting to the default category set on next read.
          next.set("categories", merged.categories.join(","));

          if (merged.statuses.length) next.set("statuses", merged.statuses.join(","));
          else next.delete("statuses");

          if (merged.ownerLabel) next.set("owner", merged.ownerLabel);
          else next.delete("owner");

          if (merged.retailerId) next.set("retailer", merged.retailerId);
          else next.delete("retailer");

          if (merged.manufacturerId) next.set("manufacturer", merged.manufacturerId);
          else next.delete("manufacturer");

          if (merged.productId) next.set("product", merged.productId);
          else next.delete("product");

          if (merged.priority.length) next.set("priority", merged.priority.join(","));
          else next.delete("priority");

          if (merged.overdueOnly) next.set("overdueOnly", "1");
          else next.delete("overdueOnly");

          if (merged.needsActionOnly) next.set("needsAction", "1");
          else next.delete("needsAction");

          if (merged.generatedFilter !== "all") next.set("generated", merged.generatedFilter);
          else next.delete("generated");

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, filters],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        FILTER_PARAM_KEYS.forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const hasActiveFilters = useMemo(
    () => JSON.stringify(filters) !== JSON.stringify(DEFAULT_CALENDAR_FILTERS),
    [filters],
  );

  return { view, setView, anchorDate, setAnchorDate, filters, setFilters, resetFilters, hasActiveFilters };
}
