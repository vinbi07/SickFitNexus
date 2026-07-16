import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { InfoTooltip } from "@/components/Tooltip";
import { toDateInput } from "@/utils/date";

export function DatePickerField({
  label,
  value,
  onChange,
  tooltip,
  minDate,
  maxDate,
  required,
  error,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  tooltip?: ReactNode;
  minDate?: string | null;
  maxDate?: string | null;
  required?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 6, left: rect.left });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const selected = value ? new Date(`${value}T00:00:00`) : undefined;
  const disabledMatchers = [
    minDate ? { before: new Date(`${minDate}T00:00:00`) } : null,
    maxDate ? { after: new Date(`${maxDate}T00:00:00`) } : null,
  ].filter((matcher): matcher is { before: Date } | { after: Date } => matcher !== null);

  return (
    <div className={`field date-picker-field${error ? " has-error" : ""}`}>
      <label>
        {label}
        {required ? <span className="date-picker-required"> *</span> : null}
        {tooltip ? <InfoTooltip content={tooltip} /> : null}
      </label>
      <button
        ref={triggerRef}
        type="button"
        className={`date-picker-trigger${error ? " has-error" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        {value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Select a date"}
      </button>
      {error ? <span className="field-error">{error}</span> : null}
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="date-picker-popover-portal"
              style={{ top: position.top, left: position.left }}
            >
              <DayPicker
                mode="single"
                selected={selected}
                defaultMonth={selected ?? new Date()}
                disabled={disabledMatchers.length ? disabledMatchers : undefined}
                onSelect={(date) => {
                  onChange(date ? toDateInput(date) : null);
                  setOpen(false);
                }}
              />
              {value ? (
                <button type="button" className="btn btn-ghost btn-small date-picker-clear" onClick={() => { onChange(null); setOpen(false); }}>
                  Clear date
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
