import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Modal } from "@/components/Modal";
import type { Product } from "@/types/domain";
import { getProductVariantLabel } from "@/utils/lookbook";

function ProductThumb({
  product,
  size = "small",
}: {
  product: Product;
  size?: "small" | "large";
}) {
  return (
    <div
      className={
        size === "large"
          ? "product-thumb-shell product-thumb-shell-large"
          : "product-thumb-shell"
      }
    >
      {product.image_url ? (
        <img
          className="product-thumb"
          src={product.image_url}
          alt={product.name}
        />
      ) : (
        <span className="product-thumb-fallback">
          {product.sku?.slice(0, 2) ?? "NA"}
        </span>
      )}
    </div>
  );
}

export function ProductPickerCombobox({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term),
    );
  }, [products, query]);

  const highlighted = filtered[highlightIndex] ?? null;

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlightIndex(0);
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(focusTimer);
    }
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  const selectProduct = (product: Product) => {
    onChange(product.id);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) =>
        Math.min(current + 1, filtered.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted) selectProduct(highlighted);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="field product-picker">
      <button
        type="button"
        className="btn btn-secondary product-picker-trigger"
        onClick={() => setOpen(true)}
      >
        Add A Product
      </button>

      {open ? (
        <Modal title="Add a Product" onClose={() => setOpen(false)}>
          <div className="section-stack product-picker-modal-body">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by product name or SKU..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
            />

            {highlighted ? (
              <div className="product-picker-preview">
                <ProductThumb product={highlighted} size="large" />
                <div className="cell-stack">
                  <strong>{highlighted.name}</strong>
                  <span className="helper-text">{highlighted.sku}</span>
                  <span className="helper-text">
                    {getProductVariantLabel(highlighted)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="empty-state">No matching products.</div>
            )}

            <ul className="product-picker-list" role="listbox">
              {filtered.map((product, index) => (
                <li
                  key={product.id}
                  role="option"
                  aria-selected={index === highlightIndex}
                >
                  <button
                    type="button"
                    className={`product-picker-option${index === highlightIndex ? " is-highlighted" : ""}`}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => selectProduct(product)}
                  >
                    <ProductThumb product={product} />
                    <span className="cell-stack">
                      <strong>{product.name}</strong>
                      <span className="helper-text">
                        {product.sku}
                        {product.variant_title
                          ? ` · ${product.variant_title}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
