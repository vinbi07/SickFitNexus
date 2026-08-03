import { useEffect, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { Modal } from "@/components/Modal";
import { NotificationBanner } from "@/components/NotificationBanner";
import type { CalendarEvent, CalendarEventStatus, ManualCalendarEventRow } from "@/lib/calendar/calendarTypes";
import { calendarService } from "@/services/calendarService";
import type { Product, Retailer, Vendor } from "@/types/domain";
import { getErrorMessage } from "@/utils/errors";

interface ManualEventFormState {
  title: string;
  description: string;
  event_date: string | null;
  priority: "" | "low" | "medium" | "high";
  status: CalendarEventStatus;
  owner_label: string;
  retailer_id: string;
  vendor_id: string;
  product_id: string;
}

function buildInitialFormState(defaultDate: string | null, editingEvent: CalendarEvent | null): ManualEventFormState {
  if (editingEvent) {
    return {
      title: editingEvent.title,
      description: editingEvent.description ?? "",
      event_date: editingEvent.date,
      priority: editingEvent.priority ?? "",
      status: editingEvent.status,
      owner_label: editingEvent.ownerLabel ?? "",
      retailer_id: editingEvent.retailerId ?? "",
      vendor_id: editingEvent.manufacturerId ?? "",
      product_id: editingEvent.productId ?? "",
    };
  }
  return {
    title: "",
    description: "",
    event_date: defaultDate,
    priority: "",
    status: "scheduled",
    owner_label: "",
    retailer_id: "",
    vendor_id: "",
    product_id: "",
  };
}

export function CalendarEventForm({
  open,
  defaultDate,
  editingEvent,
  retailerOptions,
  manufacturerOptions,
  productOptions,
  onClose,
  onSaved,
}: {
  open: boolean;
  defaultDate: string | null;
  editingEvent: CalendarEvent | null;
  retailerOptions: Retailer[];
  manufacturerOptions: Vendor[];
  productOptions: Product[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formState, setFormState] = useState<ManualEventFormState>(() => buildInitialFormState(defaultDate, editingEvent));
  const [errors, setErrors] = useState<{ title?: string; event_date?: string }>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (open) {
      setFormState(buildInitialFormState(defaultDate, editingEvent));
      setErrors({});
      setNotice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, editingEvent?.id]);

  if (!open) return null;

  function validate(): boolean {
    const nextErrors: { title?: string; event_date?: string } = {};
    if (!formState.title.trim()) nextErrors.title = "Title is required.";
    if (!formState.event_date) nextErrors.event_date = "Date is required.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setNotice(null);
    try {
      const payload: Partial<ManualCalendarEventRow> = {
        title: formState.title.trim(),
        description: formState.description.trim() || null,
        event_date: formState.event_date as string,
        priority: formState.priority || null,
        status: formState.status,
        owner_label: formState.owner_label.trim() || null,
        retailer_id: formState.retailer_id || null,
        vendor_id: formState.vendor_id || null,
        product_id: formState.product_id || null,
      };

      if (editingEvent?.sourceId) {
        await calendarService.updateManualEvent(editingEvent.sourceId, payload);
      } else {
        await calendarService.createManualEvent(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setNotice({ tone: "error", message: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={editingEvent ? "Edit Calendar Event" : "Create Calendar Event"}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving..." : "Save Event"}
          </button>
        </>
      }
    >
      <div className="section-stack">
        {notice ? <NotificationBanner tone={notice.tone} message={notice.message} onClose={() => setNotice(null)} /> : null}

        <div className="field field-wide">
          <label htmlFor="calendar-form-title">Title *</label>
          <input
            id="calendar-form-title"
            type="text"
            value={formState.title}
            onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
          />
          {errors.title ? <span className="field-error">{errors.title}</span> : null}
        </div>

        <div className="field field-wide">
          <label htmlFor="calendar-form-description">Description</label>
          <textarea
            id="calendar-form-description"
            value={formState.description}
            onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
          />
        </div>

        <DatePickerField
          label="Event Date"
          required
          value={formState.event_date}
          onChange={(value) => setFormState((current) => ({ ...current, event_date: value }))}
          error={errors.event_date}
        />

        <div className="field">
          <label htmlFor="calendar-form-priority">Priority</label>
          <select
            id="calendar-form-priority"
            value={formState.priority}
            onChange={(event) => setFormState((current) => ({ ...current, priority: event.target.value as ManualEventFormState["priority"] }))}
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="calendar-form-status">Status</label>
          <select
            id="calendar-form-status"
            value={formState.status}
            onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as CalendarEventStatus }))}
          >
            <option value="scheduled">Scheduled</option>
            <option value="waiting">Waiting</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="calendar-form-owner">Owner</label>
          <input
            id="calendar-form-owner"
            type="text"
            value={formState.owner_label}
            onChange={(event) => setFormState((current) => ({ ...current, owner_label: event.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="calendar-form-retailer">Related Retailer / Account</label>
          <select
            id="calendar-form-retailer"
            value={formState.retailer_id}
            onChange={(event) => setFormState((current) => ({ ...current, retailer_id: event.target.value }))}
          >
            <option value="">None</option>
            {retailerOptions.map((retailer) => (
              <option key={retailer.id} value={retailer.id}>
                {retailer.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="calendar-form-manufacturer">Related Manufacturer</label>
          <select
            id="calendar-form-manufacturer"
            value={formState.vendor_id}
            onChange={(event) => setFormState((current) => ({ ...current, vendor_id: event.target.value }))}
          >
            <option value="">None</option>
            {manufacturerOptions.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="calendar-form-product">Related Product</label>
          <select
            id="calendar-form-product"
            value={formState.product_id}
            onChange={(event) => setFormState((current) => ({ ...current, product_id: event.target.value }))}
          >
            <option value="">None</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
