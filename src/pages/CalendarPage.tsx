import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Plus } from "lucide-react";
import { DashboardCard } from "@/components/DashboardCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PageHeader } from "@/components/PageHeader";
import { CalendarEventDrawer } from "@/components/calendar/CalendarEventDrawer";
import { CalendarEventForm } from "@/components/calendar/CalendarEventForm";
import { CalendarFiltersBar } from "@/components/calendar/CalendarFiltersBar";
import {
  CalendarAgendaView,
  CalendarMonthView,
  CalendarViewLabel,
  CalendarWeekView,
} from "@/components/calendar/CalendarViews";
import { navigatePeriod } from "@/lib/calendar/calendarDates";
import type { CalendarEvent, CalendarView } from "@/lib/calendar/calendarTypes";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import { filterCalendarEvents, useCalendarFilters } from "@/hooks/useCalendarFilters";
import { addDays, toDateInput } from "@/utils/date";

const VIEWS: CalendarView[] = ["month", "week", "agenda"];

export function CalendarPage() {
  const { events, loading, error, reload, retailerOptions, manufacturerOptions, productOptions } = useCalendarEvents();
  const { view, setView, anchorDate, setAnchorDate, filters, setFilters, resetFilters, hasActiveFilters } =
    useCalendarFilters();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaultDate, setFormDefaultDate] = useState<string | null>(null);
  const [formEditingEvent, setFormEditingEvent] = useState<CalendarEvent | null>(null);

  const anchorDateObj = useMemo(() => new Date(`${anchorDate}T00:00:00`), [anchorDate]);

  const filteredEvents = useMemo(() => filterCalendarEvents(events, filters), [events, filters]);

  const ownerOptions = useMemo(() => {
    const owners = new Set<string>();
    events.forEach((event) => {
      if (event.ownerLabel) owners.add(event.ownerLabel);
    });
    return [...owners].sort();
  }, [events]);

  const summary = useMemo(() => {
    const today = toDateInput(new Date());
    const weekEnd = toDateInput(addDays(new Date(), 7));
    return {
      hasEvents: events.length > 0,
      hasInvoiceEvents: events.some((event) => event.category === "invoice"),
      hasProductionEvents: events.some((event) => event.category === "production"),
      dueToday: events.filter((event) => event.date === today && event.status !== "completed").length,
      overdue: events.filter((event) => event.status === "overdue").length,
      dueThisWeek: events.filter((event) => event.date >= today && event.date <= weekEnd && event.status !== "completed").length,
      atRisk: events.filter((event) => event.status === "at_risk").length,
      upcomingPayments: events.filter((event) => event.category === "invoice" && event.status !== "completed" && event.date >= today).length,
      upcomingProduction: events.filter((event) => event.category === "production" && event.status !== "completed" && event.date >= today).length,
    };
  }, [events]);

  function handleSelectEvent(event: CalendarEvent) {
    setSelectedEvent(event);
    setDrawerOpen(true);
  }

  function handleSelectEmptyDate(date: string) {
    setFormEditingEvent(null);
    setFormDefaultDate(date);
    setFormOpen(true);
  }

  function handleCreateEvent() {
    setFormEditingEvent(null);
    setFormDefaultDate(toDateInput(new Date()));
    setFormOpen(true);
  }

  function handleEditManual(event: CalendarEvent) {
    setDrawerOpen(false);
    setFormEditingEvent(event);
    setFormDefaultDate(null);
    setFormOpen(true);
  }

  if (loading) return <LoadingState message="Loading calendar data..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="section-stack">
      <PageHeader
        title="Calendar"
        description="A centralized operations calendar for purchase order, invoice, production, inventory, retailer, and compliance deadlines, plus manually created tasks."
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setFiltersOpen((current) => !current)}>
              <Filter size={15} aria-hidden="true" /> Filter{hasActiveFilters ? " (active)" : ""}
            </button>
            <button className="btn btn-primary" onClick={handleCreateEvent}>
              <Plus size={15} aria-hidden="true" /> Create Event
            </button>
          </div>
        }
      />

      <div className="panel calendar-toolbar">
        <div className="btn-row">
          <button className="btn btn-secondary" onClick={() => setAnchorDate(toDateInput(new Date()))}>
            Today
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            aria-label="Previous period"
            onClick={() => setAnchorDate(toDateInput(navigatePeriod(anchorDateObj, view, -1)))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            aria-label="Next period"
            onClick={() => setAnchorDate(toDateInput(navigatePeriod(anchorDateObj, view, 1)))}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <CalendarViewLabel anchorDate={anchorDateObj} view={view} />
        </div>
        <div className="pill-row">
          {VIEWS.map((viewOption) => (
            <button
              key={viewOption}
              className={`btn ${view === viewOption ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setView(viewOption)}
            >
              {viewOption[0].toUpperCase() + viewOption.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <CalendarFiltersBar
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={resetFilters}
        retailerOptions={retailerOptions}
        manufacturerOptions={manufacturerOptions}
        productOptions={productOptions}
        ownerOptions={ownerOptions}
      />

      {summary.hasEvents ? (
        <div className="card-grid">
          <DashboardCard label="Due Today" value={summary.dueToday} />
          <DashboardCard label="Overdue" value={summary.overdue} highlight={summary.overdue > 0} />
          <DashboardCard label="Due This Week" value={summary.dueThisWeek} />
          <DashboardCard label="At Risk" value={summary.atRisk} />
          {summary.hasInvoiceEvents ? (
            <DashboardCard label="Upcoming Payments" value={summary.upcomingPayments} />
          ) : null}
          {summary.hasProductionEvents ? (
            <DashboardCard label="Upcoming Production Milestones" value={summary.upcomingProduction} />
          ) : null}
        </div>
      ) : null}

      {!filteredEvents.length ? (
        <EmptyState
          message={
            events.length
              ? "No events match your current filters."
              : "No operational events are scheduled right now."
          }
        />
      ) : view === "month" ? (
        <CalendarMonthView
          anchorDate={anchorDateObj}
          events={filteredEvents}
          onSelectEvent={handleSelectEvent}
          onSelectEmptyDate={handleSelectEmptyDate}
        />
      ) : view === "week" ? (
        <CalendarWeekView
          anchorDate={anchorDateObj}
          events={filteredEvents}
          onSelectEvent={handleSelectEvent}
          onSelectEmptyDate={handleSelectEmptyDate}
        />
      ) : (
        <CalendarAgendaView anchorDate={anchorDateObj} events={filteredEvents} onSelectEvent={handleSelectEvent} />
      )}

      <CalendarEventDrawer
        event={selectedEvent}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onEditManual={handleEditManual}
        onChanged={() => void reload()}
      />

      <CalendarEventForm
        open={formOpen}
        defaultDate={formDefaultDate}
        editingEvent={formEditingEvent}
        retailerOptions={retailerOptions}
        manufacturerOptions={manufacturerOptions}
        productOptions={productOptions}
        onClose={() => setFormOpen(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
