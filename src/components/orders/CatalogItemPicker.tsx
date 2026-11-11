import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Modal } from "@/components/Modal";
import { searchCatalogOptions, type CatalogOption } from "@/utils/catalogPicker";

/**
 * Picks what a PO line bills: a Nexus product or a barcode-book entry. Type any part of the
 * product name, SKU or UPC; with nothing typed, the closest matches to the PO line come first.
 */
export function CatalogItemPicker({
  options,
  value,
  hint,
  disabled,
  onChange,
}: {
  options: CatalogOption[];
  value: string | null;
  hint?: { text?: string | null; upc?: string | null };
  disabled?: boolean;
  onChange: (option: CatalogOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => options.find((option) => option.id === value) ?? null, [options, value]);
  const results = useMemo(() => (open ? searchCatalogOptions(options, query, hint) : []), [open, options, query, hint]);
  const highlighted = results[highlightIndex] ?? null;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlightIndex(0);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  const choose = (option: CatalogOption | null) => {
    onChange(option);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted) choose(highlighted);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary catalog-picker-trigger"
        disabled={disabled}
        title={selected ? `${selected.title}\n${selected.detail}` : undefined}
        onClick={() => setOpen(true)}
      >
        {selected ? <span className="catalog-picker-name">{selected.title}</span> : "Choose a product..."}
      </button>

      {open ? (
        <Modal title="Choose the product for this line" onClose={() => setOpen(false)}>
          <div className="section-stack product-picker-modal-body">
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a product name, SKU or UPC..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {hint?.text ? <p className="helper-text">On the PO: {hint.text}{hint.upc ? ` · UPC ${hint.upc}` : ""}</p> : null}
            {!results.length ? <div className="empty-state">No products or barcodes match.</div> : null}
            <ul className="product-picker-list" role="listbox">
              {results.map((option, index) => (
                <li key={option.id} role="option" aria-selected={index === highlightIndex}>
                  <button
                    type="button"
                    className={`product-picker-option${index === highlightIndex ? " is-highlighted" : ""}`}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => choose(option)}
                  >
                    <span className="cell-stack">
                      <strong>
                        {option.title}
                        {option.kind === "barcode" ? <span className="catalog-picker-tag">Barcode only</span> : null}
                      </strong>
                      <span className="helper-text">{option.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {selected ? (
              <div className="btn-row">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => choose(null)}>
                  Clear this match
                </button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
