import { Link } from "react-router-dom";
import type { Product } from "@/types/domain";
import { getProductVariantLabel } from "@/utils/lookbook";

type ProductNameWithMetadataProps = {
  product: Pick<Product, "id" | "name" | "sku" | "image_url" | "variant_title" | "parent_product_id"> | null | undefined;
  fallbackName?: string;
  fallbackSku?: string;
  linkToDetail?: boolean;
  large?: boolean;
};

export function ProductNameWithMetadata({
  product,
  fallbackName = "Unknown Product",
  fallbackSku = "No SKU",
  linkToDetail = true,
  large = false,
}: ProductNameWithMetadataProps) {
  return (
    <div className="inventory-product-cell">
      <div className={large ? "product-thumb-shell product-thumb-shell-large" : "product-thumb-shell"}>
        {product?.image_url ? (
          <img className="product-thumb" src={product.image_url} alt={product.name} />
        ) : (
          <span className="product-thumb-fallback">{product?.sku?.slice(0, 2) ?? "NA"}</span>
        )}
      </div>
      <div className="cell-stack">
        <strong>
          {product?.id && linkToDetail ? (
            <Link className="table-link" to={`/products/${product.id}`}>
              {product.name}
            </Link>
          ) : (
            product?.name ?? fallbackName
          )}
        </strong>
        <span className="helper-text">{product?.sku ?? fallbackSku}</span>
        {product ? <span className="helper-text">{getProductVariantLabel(product)}</span> : null}
      </div>
    </div>
  );
}
