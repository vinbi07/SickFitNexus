import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export function RowActionsMenu({
  children,
  triggerLabel,
}: {
  children: ReactNode;
  /** Renders a labelled "More actions" style button instead of the compact "+" trigger. */
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 6, left: rect.right });
    };
    updatePosition();
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerLabel ? "btn btn-secondary" : "btn btn-ghost btn-small row-actions-trigger"}
        onClick={() => setOpen((current) => !current)}
        aria-label={triggerLabel ? undefined : "More actions"}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {triggerLabel ? (
          <>
            {triggerLabel}
            <ChevronDown size={16} aria-hidden="true" />
          </>
        ) : (
          "+"
        )}
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="date-picker-popover-portal row-actions-menu"
              style={{ top: position.top, left: position.left }}
              onClick={() => setOpen(false)}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
