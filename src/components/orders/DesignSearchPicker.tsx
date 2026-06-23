import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CatalogDesignOption } from "@/services/orderDesignService";

export function DesignSearchPicker({
  selectedLabel,
  catalogOptions,
  onSetDesign,
  onOpenNewDesign,
}: {
  selectedLabel: string;
  catalogOptions: CatalogDesignOption[];
  onSetDesign: (id: string) => void;
  onOpenNewDesign?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 260 });
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = catalogOptions.filter((o) =>
    !search.trim() || o.label.toLowerCase().includes(search.toLowerCase())
  );

  function openDropdown() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      // Flip up if less than 240px below viewport bottom
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = Math.min(filtered.length * 34 + 40, 240);
      const top = spaceBelow < dropHeight ? rect.top - dropHeight - 3 : rect.bottom + 3;
      setDropPos({ top, left: rect.left, width: Math.max(rect.width, 280) });
    }
    setSearch("");
    setOpen(true);
  }

  const dropdown = open ? (
    <div
      className="mfr-design-dropdown"
      style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
    >
      {filtered.length === 0 ? (
        <div className="mfr-design-option mfr-design-empty">No matches</div>
      ) : (
        filtered.map((opt) => (
          <div
            key={opt.id}
            className="mfr-design-option"
            onMouseDown={() => { onSetDesign(opt.id); setOpen(false); setSearch(""); }}
          >
            {opt.label}
          </div>
        ))
      )}
      {onOpenNewDesign ? (
        <div
          className="mfr-design-option mfr-design-new"
          onMouseDown={() => { onOpenNewDesign(); setOpen(false); setSearch(""); }}
        >
          + New custom design…
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="mfr-design-wrap">
      <input
        ref={inputRef}
        value={open ? search : selectedLabel}
        placeholder="Search designs & products…"
        onFocus={openDropdown}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: "100%" }}
      />
      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
