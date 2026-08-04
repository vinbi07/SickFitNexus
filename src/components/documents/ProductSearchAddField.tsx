import { useMemo, useState, type KeyboardEvent } from "react";
import { ProductNameWithMetadata } from "@/components/ProductNameWithMetadata";
import type { Product, ProductBarcode } from "@/types/domain";

function getLinkedProduct(barcode: ProductBarcode): Product | null {
  return (
    (barcode.product_barcode_links ?? []).find((link) => link.products)?.products ?? null
  );
}

export function ProductSearchAddField({
  barcodes,
  onAdd,
  placeholder = "Search by name, SKU, or UPC to add a product...",
}: {
  barcodes: ProductBarcode[];
  onAdd: (barcode: ProductBarcode) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return barcodes
      .filter((barcode) => {
        const linkedProducts = (barcode.product_barcode_links ?? [])
          .map((link) => link.products)
          .filter((product): product is Product => Boolean(product));
        const haystack = [
          barcode.product_name,
          barcode.sku,
          barcode.barcode_upc ?? "",
          barcode.collection ?? "",
          barcode.size ?? "",
          linkedProducts.map((product) => [product.name, product.sku, product.upc ?? ""].join(" ")).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 30);
  }, [barcodes, query]);

  const open = query.trim().length > 0;
  const highlighted = filtered[highlightIndex] ?? null;

  function selectBarcode(barcode: ProductBarcode) {
    onAdd(barcode);
    setQuery("");
    setHighlightIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !filtered.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightIndex((current) => Math.min(current + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (highlighted) selectBarcode(highlighted);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  return (
    <div className="field field-wide">
      <input
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlightIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <ul className="product-picker-list" role="listbox">
          {filtered.map((barcode, index) => {
            const linkedProduct = getLinkedProduct(barcode);
            return (
              <li key={barcode.id} role="option" aria-selected={index === highlightIndex}>
                <button
                  type="button"
                  className={`product-picker-option${index === highlightIndex ? " is-highlighted" : ""}`}
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => selectBarcode(barcode)}
                >
                  <ProductNameWithMetadata
                    product={
                      linkedProduct ?? {
                        id: "",
                        name: barcode.product_name,
                        sku: barcode.sku,
                        image_url: null,
                        variant_title: barcode.size,
                        parent_product_id: null,
                      }
                    }
                    fallbackName={barcode.product_name}
                    fallbackSku={barcode.sku}
                    linkToDetail={false}
                  />
                </button>
              </li>
            );
          })}
          {!filtered.length ? <li className="helper-text">No products match that search.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
