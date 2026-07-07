import type { Product, Retailer } from "@/types/domain";
import {
  getDisplaySku,
  getLookbookMetaLine,
  getLookbookRetailPrice,
  getLookbookWholesalePrice,
  getOrderUnitLabel,
  getProductFamilyName,
  getProductVariantLabel,
  resolveCasePackQuantity,
  sortProductsByFamily,
} from "@/utils/lookbook";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function getLookbookDocumentStyles() {
  return `
    * { box-sizing: border-box; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1f2430; margin: 0; }
    .lb-doc { max-width: 960px; margin: 0 auto; padding: 32px; }
    .lb-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1f2430; padding-bottom: 16px; margin-bottom: 24px; }
    .lb-brand { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin: 0 0 6px; }
    .lb-title { font-size: 26px; margin: 0 0 4px; }
    .lb-sub { font-size: 14px; color: #4b5563; margin: 0; }
    .lb-logo { max-width: 140px; max-height: 70px; object-fit: contain; }
    .lb-meta { font-size: 12px; color: #6b7280; text-align: right; }
    .lb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .lb-card { border: 1px solid #d7d9df; border-radius: 8px; padding: 14px; break-inside: avoid; page-break-inside: avoid; display: flex; gap: 12px; }
    .lb-card-media { width: 84px; height: 84px; border-radius: 6px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
    .lb-card-media img { width: 100%; height: 100%; object-fit: cover; }
    .lb-card-body { flex: 1; }
    .lb-card-name { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
    .lb-card-sku { font-size: 12px; color: #6b7280; margin: 0 0 6px; }
    .lb-card-meta { font-size: 12px; color: #4b5563; margin: 0 0 6px; }
    .lb-price-row { display: flex; gap: 16px; font-size: 12px; }
    .lb-price-row strong { display: block; font-size: 14px; }
    .lb-empty { padding: 24px; text-align: center; color: #6b7280; }
    @page { margin: 14mm; }
    @media print {
      body { padding: 0; }
      .lb-doc { padding: 0; }
    }
  `;
}

export function buildLookbookDocumentHtml(params: {
  accountName: string;
  buyerName: string;
  retailer: Retailer | null;
  products: Product[];
  generatedDate: string;
}) {
  const products = sortProductsByFamily(params.products);
  const logo = params.retailer?.logo_url
    ? `<img class="lb-logo" src="${escapeHtml(params.retailer.logo_url)}" alt="${escapeHtml(params.accountName)} logo" />`
    : "";

  const cards = products.length
    ? products
        .map((product) => {
          const displaySku = getDisplaySku(product);
          const metaLine = getLookbookMetaLine(product);
          const wholesale = getLookbookRetailPrice(product) > 0 || getLookbookWholesalePrice(product) > 0
            ? `<div class="lb-price-row">
                <div>Wholesale<strong>$${getLookbookWholesalePrice(product).toFixed(2)}</strong></div>
                <div>MSRP<strong>$${getLookbookRetailPrice(product).toFixed(2)}</strong></div>
              </div>`
            : "";
          const media = product.image_url
            ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(getProductFamilyName(product))}" />`
            : escapeHtml(displaySku.slice(0, 2));

          return `
            <article class="lb-card">
              <div class="lb-card-media">${media}</div>
              <div class="lb-card-body">
                <p class="lb-card-name">${escapeHtml(getProductFamilyName(product))}</p>
                <p class="lb-card-sku">${escapeHtml(getProductVariantLabel(product))} · ${escapeHtml(displaySku)}</p>
                <p class="lb-card-meta">${resolveCasePackQuantity(product)} ${escapeHtml(getOrderUnitLabel(product))}/case</p>
                ${wholesale}
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="lb-empty">No products selected for this lookbook yet.</div>`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(params.accountName)} SickFit Lookbook</title>
        <style>${getLookbookDocumentStyles()}</style>
      </head>
      <body>
        <div class="lb-doc">
          <div class="lb-header">
            <div>
              <p class="lb-brand">SickFit</p>
              <h1 class="lb-title">${escapeHtml(params.accountName)} SickFit Lookbook</h1>
              <p class="lb-sub">${escapeHtml(params.buyerName)}</p>
            </div>
            <div>
              ${logo}
              <p class="lb-meta">Generated ${escapeHtml(params.generatedDate)}</p>
            </div>
          </div>
          <div class="lb-grid">${cards}</div>
        </div>
      </body>
    </html>
  `;
}
