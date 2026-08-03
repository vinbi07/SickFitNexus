import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  BookImage,
  Boxes,
  CheckCircle2,
  Clock,
  ClipboardList,
  Factory,
  Hourglass,
  Receipt,
  Scale,
  StickyNote,
  Store,
  type LucideIcon,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import {
  formatPeriodLabel,
  getAgendaDayLabel,
  getMonthGridDays,
  getVisibleRange,
  getWeekDays,
  groupEventsByDate,
  isSameDay,
  isSameMonth,
} from "@/lib/calendar/calendarDates";
import {
  CALENDAR_CATEGORY_LABELS,
  CALENDAR_STATUS_LABELS,
  type CalendarEvent,
  type CalendarEventCategory,
  type CalendarEventStatus,
  type CalendarView,
} from "@/lib/calendar/calendarTypes";
import { toDateInput } from "@/utils/date";

export const CATEGORY_ICONS: Record<CalendarEventCategory, LucideIcon> = {
  purchase_order: ClipboardList,
  invoice: Receipt,
  production: Factory,
  inventory: Boxes,
  retailer: Store,
  compliance: Scale,
  lookbook: BookImage,
  manual: StickyNote,
};

export const STATUS_ICONS: Record<CalendarEventStatus, LucideIcon> = {
  overdue: AlertTriangle,
  at_risk: AlertCircle,
  due_soon: Clock,
  waiting: Hourglass,
  blocked: Ban,
  completed: CheckCircle2,
  scheduled: Clock,
};

const STATUS_CLASS: Record<CalendarEventStatus, string> = {
  overdue: "status-danger",
  at_risk: "status-warning",
  due_soon: "status-warning",
  waiting: "status-info",
  blocked: "status-danger",
  completed: "status-success",
  scheduled: "status-neutral",
};

export function CalendarStatusBadge({ status }: { status: CalendarEventStatus }) {
  const Icon = STATUS_ICONS[status];
  return (
    <span className={`status-badge ${STATUS_CLASS[status]} calendar-status-badge`}>
      <Icon size={12} aria-hidden="true" />
      {CALENDAR_STATUS_LABELS[status]}
    </span>
  );
}

export function CalendarEventChip({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick: () => void;
}) {
  const Icon = CATEGORY_ICONS[event.category];
  const sourceNumber =
    (event.metadata?.poNumber as string | undefined) ??
    (event.metadata?.invoiceNumber as string | undefined) ??
    (event.metadata?.planName as string | undefined) ??
    null;

  return (
    <button
      type="button"
      className={`calendar-event-chip calendar-chip-${STATUS_CLASS[event.status]}`}
      onClick={onClick}
      aria-label={`${CALENDAR_CATEGORY_LABELS[event.category]}: ${event.title}, status ${CALENDAR_STATUS_LABELS[event.status]}`}
    >
      <Icon size={13} aria-hidden="true" className="calendar-chip-icon" />
      <span className="calendar-chip-title">
        {sourceNumber ? `${sourceNumber} · ` : ""}
        {event.title}
      </span>
    </button>
  );
}

function DayEventsModal({
  dateLabel,
  events,
  onSelectEvent,
  onClose,
}: {
  dateLabel: string;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={dateLabel} onClose={onClose}>
      <div className="section-stack calendar-day-modal-body">
        {events.map((event) => (
          <div key={event.id} className="calendar-agenda-item">
            <CalendarEventChip event={event} onClick={() => onSelectEvent(event)} />
            <CalendarStatusBadge status={event.status} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

const MAX_CHIPS_PER_CELL = 3;

export function CalendarMonthView({
  anchorDate,
  events,
  onSelectEvent,
  onSelectEmptyDate,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectEmptyDate: (date: string) => void;
}) {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const days = getMonthGridDays(anchorDate);
  const eventsByDate = groupEventsByDate(events);
  const today = new Date();

  return (
    <div className="calendar-month-grid">
      <div className="calendar-month-weekday-row">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="calendar-month-weekday">
            {label}
          </div>
        ))}
      </div>
      <div className="calendar-month-days">
        {days.map((day) => {
          const dateStr = toDateInput(day);
          const dayEvents = (eventsByDate.get(dateStr) ?? []).slice().sort((a, b) => a.status.localeCompare(b.status));
          const visibleEvents = dayEvents.slice(0, MAX_CHIPS_PER_CELL);
          const hiddenCount = dayEvents.length - visibleEvents.length;

          return (
            <div
              key={dateStr}
              className={`calendar-month-cell${isSameMonth(day, anchorDate) ? "" : " calendar-month-cell-muted"}${isSameDay(day, today) ? " calendar-month-cell-today" : ""}`}
            >
              <button
                type="button"
                className="calendar-month-cell-daynum"
                onClick={() => onSelectEmptyDate(dateStr)}
                aria-label={`Create event on ${dateStr}`}
              >
                {day.getDate()}
              </button>
              <div className="calendar-month-cell-events">
                {visibleEvents.map((event) => (
                  <CalendarEventChip key={event.id} event={event} onClick={() => onSelectEvent(event)} />
                ))}
                {hiddenCount > 0 ? (
                  <button
                    type="button"
                    className="calendar-more-events-btn"
                    onClick={() => setExpandedDate(dateStr)}
                  >
                    +{hiddenCount} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {expandedDate ? (
        <DayEventsModal
          dateLabel={getAgendaDayLabel(expandedDate, toDateInput(new Date()))}
          events={eventsByDate.get(expandedDate) ?? []}
          onSelectEvent={(event) => {
            setExpandedDate(null);
            onSelectEvent(event);
          }}
          onClose={() => setExpandedDate(null)}
        />
      ) : null}
    </div>
  );
}

export function CalendarWeekView({
  anchorDate,
  events,
  onSelectEvent,
  onSelectEmptyDate,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectEmptyDate: (date: string) => void;
}) {
  const days = getWeekDays(anchorDate);
  const eventsByDate = groupEventsByDate(events);
  const today = new Date();

  return (
    <div className="calendar-week-grid">
      {days.map((day) => {
        const dateStr = toDateInput(day);
        const dayEvents = eventsByDate.get(dateStr) ?? [];

        return (
          <div key={dateStr} className={`calendar-week-column${isSameDay(day, today) ? " calendar-month-cell-today" : ""}`}>
            <div className="calendar-week-column-header">
              <span>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(day)}</span>
              <button
                type="button"
                className="calendar-month-cell-daynum"
                onClick={() => onSelectEmptyDate(dateStr)}
                aria-label={`Create event on ${dateStr}`}
              >
                {day.getDate()}
              </button>
            </div>
            <div className="calendar-week-column-events">
              {dayEvents.length ? (
                dayEvents.map((event) => (
                  <div key={event.id} className="calendar-agenda-item">
                    <CalendarEventChip event={event} onClick={() => onSelectEvent(event)} />
                  </div>
                ))
              ) : (
                <span className="helper-text calendar-week-empty">No events</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarAgendaView({
  anchorDate,
  events,
  onSelectEvent,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const range = getVisibleRange(anchorDate, "agenda");
  const today = toDateInput(new Date());
  const sorted = events
    .filter((event) => event.date >= range.start && event.date <= range.end)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const eventsByDate = groupEventsByDate(sorted);
  const orderedDates = [...eventsByDate.keys()].sort();

  if (!orderedDates.length) {
    return <div className="empty-state">No events in this agenda window.</div>;
  }

  return (
    <div className="calendar-agenda-list section-stack">
      {orderedDates.map((dateStr) => (
        <div key={dateStr} className="calendar-agenda-day-group">
          <h4 className="calendar-agenda-day-heading">{getAgendaDayLabel(dateStr, today)}</h4>
          <div className="section-stack">
            {(eventsByDate.get(dateStr) ?? []).map((event) => (
              <div key={event.id} className="calendar-agenda-item calendar-agenda-item-wide">
                <CalendarEventChip event={event} onClick={() => onSelectEvent(event)} />
                <CalendarStatusBadge status={event.status} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalendarViewLabel({ anchorDate, view }: { anchorDate: Date; view: CalendarView }) {
  return <span className="calendar-period-label">{formatPeriodLabel(anchorDate, view)}</span>;
}
