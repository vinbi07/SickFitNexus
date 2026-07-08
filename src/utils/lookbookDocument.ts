import type { Product, Retailer } from "@/types/domain";
import {
  getDisplaySku,
  getLookbookRetailPrice,
  getLookbookWholesalePrice,
  getProductFamilyName,
  getProductVariantLabel,
  resolveBarcode,
  resolveCasePackQuantity,
  sortProductsByFamily,
} from "@/utils/lookbook";

const SICKFIT_LOGO_SRC = "/assets/SickFit Logo.png";
const PRODUCTS_PER_PAGE = 4;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chunk<T>(items: T[], size: number): T[][] {
  if (!items.length) return [[]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatMoney(value: number) {
  return `$${(Number.isFinite(value) ? value : 0).toFixed(2)}`;
}

function logoLockupMarkup(src: string | null | undefined, placeholderLabel: string) {
  const label = escapeHtml(placeholderLabel);
  if (src) {
    return `<div class="lb-logo-circle">
      <img src="${escapeHtml(src)}" alt="${label}" onerror="this.remove(); this.parentElement.classList.add('is-placeholder')" />
    </div>`;
  }
  return `<div class="lb-logo-circle is-placeholder"><span class="lb-logo-placeholder">${label}</span></div>`;
}

export function getLookbookDocumentFontImport() {
  return `@import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');`;
}

export function getLookbookDocumentFontStyles() {
  return `
    @font-face {
      font-family: "Gilroy";
      src: url("/fonts/Gilroy-Regular.ttf") format("truetype");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Gilroy";
      src: url("/fonts/Gilroy-SemiBold.ttf") format("truetype");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Gilroy";
      src: url("/fonts/Gilroy-Bold.ttf") format("truetype");
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Gilroy";
      src: url("/fonts/Gilroy-ExtraBold.ttf") format("truetype");
      font-weight: 800;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Gilroy";
      src: url("/fonts/Gilroy-Black.ttf") format("truetype");
      font-weight: 900;
      font-style: normal;
      font-display: swap;
    }
  `.trim();
}

export function getLookbookDocumentStyles() {
  return `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Poppins", "Helvetica Neue", Arial, sans-serif; color: #111111; margin: 0; background: #ffffff; }
    @page { size: letter; margin: 0; }

    .lb-page { width: 8.5in; min-height: 11in; padding: 0.45in 0.5in 0; background: #ffffff; display: flex; flex-direction: column; page-break-after: always; }
    .lb-page:last-child { page-break-after: auto; }

    .lb-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .lb-hero-text { flex: 1; min-width: 0; }
    .lb-hero-line { font-family: "Gilroy", Arial, sans-serif; font-weight: 900; font-size: 42px; line-height: 1.02; margin: 0; text-transform: uppercase; }
    .lb-hero-line.accent { color: #e72027; }
    .lb-hero-sub { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #111111; margin: 10px 0 0; }

    .lb-lockup { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
    .lb-logo-circle { position: relative; width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
    .lb-logo-circle.is-placeholder { background: #d9dbdd; }
    .lb-logo-circle img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
    .lb-logo-placeholder { position: relative; font-size: 11px; font-weight: 700; text-align: center; line-height: 1.2; color: #4b4f57; padding: 6px; text-transform: none; }
    .lb-lockup-x { font-size: 18px; font-weight: 700; color: #111111; }

    .lb-divider { height: 3px; background: #e72027; border: none; margin: 20px 0 18px; }

    .lb-section-title { font-family: "Gilroy", Arial, sans-serif; font-weight: 700; font-size: 22px; text-transform: uppercase; margin: 0 0 16px; }

    .lb-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; align-content: start; }
    .lb-empty { grid-column: 1 / -1; padding: 40px; text-align: center; color: #6b7280; border: 1px dashed #d7d9df; border-radius: 8px; }

    .lb-card { border: 1px solid #d7d9df; border-radius: 10px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; background: #ffffff; }
    .lb-card-header { background: #111111; color: #ffffff; padding: 10px 14px; }
    .lb-card-sku { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffffff; margin: 0; }
    .lb-card-name { font-family: "Gilroy", Arial, sans-serif; font-weight: 700; font-size: 16px; text-transform: uppercase; color: #e72027; margin: 2px 0; line-height: 1.15; overflow-wrap: break-word; }
    .lb-card-size { font-size: 10px; color: #ffffff; margin: 0; }
    .lb-card-size strong { font-weight: 700; }

    .lb-card-body { padding: 14px; flex: 1; display: flex; flex-direction: column; }
    .lb-card-row { display: flex; gap: 14px; align-items: stretch; }
    .lb-card-media { width: 44%; aspect-ratio: 1 / 1; border-radius: 6px; background: #d9dbdd; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
    .lb-card-media img { width: 100%; height: 100%; object-fit: cover; }

    .lb-card-pricing { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
    .lb-price-label { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #111111; margin: 0 0 2px; }
    .lb-price-value { font-size: 15px; font-weight: 700; margin: 0; }

    .lb-card-divider { height: 2px; background: #e72027; border: none; margin: 12px 0; }

    .lb-card-meta { display: flex; justify-content: space-between; gap: 12px; }
    .lb-meta-label { font-size: 9px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #4b4f57; margin: 0 0 2px; }
    .lb-meta-value { font-size: 11px; color: #111111; margin: 0; }
    .lb-meta-right { text-align: right; }

    .lb-footer { margin-top: auto; background: #111111; color: #ffffff; display: flex; justify-content: space-between; align-items: center; padding: 14px 0.5in; margin-left: -0.5in; margin-right: -0.5in; font-size: 11px; letter-spacing: 0.02em; }

    @media print {
      body { margin: 0; }
    }
  `.trim();
}

export function buildLookbookDocumentHtml(params: {
  accountName: string;
  buyerName: string;
  retailer: Retailer | null;
  products: Product[];
  generatedDate: string;
}) {
  const products = sortProductsByFamily(params.products);
  const pages = chunk(products, PRODUCTS_PER_PAGE);
  const buyerLogoMarkup = logoLockupMarkup(params.retailer?.logo_url ?? null, "Buyer Logo");
  const sickfitLogoMarkup = logoLockupMarkup(SICKFIT_LOGO_SRC, "SickFit Logo");

  const pagesMarkup = pages
    .map((pageProducts) => {
      const cardsMarkup = pageProducts.length
        ? pageProducts
            .map((product) => {
              const displaySku = getDisplaySku(product) || "SKU PENDING";
              const productName = getProductFamilyName(product);
              const sizeType = getProductVariantLabel(product);
              const wholesale = getLookbookWholesalePrice(product);
              const msrp = getLookbookRetailPrice(product);
              const barcode = resolveBarcode(product) ?? "Pending";
              const casePack = resolveCasePackQuantity(product);
              const media = product.image_url
                ? `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(productName)}" />`
                : "";

              return `
                <article class="lb-card">
                  <div class="lb-card-header">
                    <p class="lb-card-sku">${escapeHtml(displaySku)}</p>
                    <p class="lb-card-name">${escapeHtml(productName)}</p>
                    <p class="lb-card-size"><strong>${escapeHtml(sizeType)}</strong> | US MEN 7-12 / WOMEN 8-13</p>
                  </div>
                  <div class="lb-card-body">
                    <div class="lb-card-row">
                      <div class="lb-card-media">${media}</div>
                      <div class="lb-card-pricing">
                        <div>
                          <p class="lb-price-label">Wholesale</p>
                          <p class="lb-price-value">${formatMoney(wholesale)}</p>
                        </div>
                        <div>
                          <p class="lb-price-label">Suggested MSRP</p>
                          <p class="lb-price-value">${formatMoney(msrp)}</p>
                        </div>
                      </div>
                    </div>
                    <hr class="lb-card-divider" />
                    <div class="lb-card-meta">
                      <div>
                        <p class="lb-meta-label">UPC</p>
                        <p class="lb-meta-value">${escapeHtml(barcode)}</p>
                      </div>
                      <div class="lb-meta-right">
                        <p class="lb-meta-label">Case Pack</p>
                        <p class="lb-meta-value">${casePack} PAIRS</p>
                      </div>
                    </div>
                  </div>
                </article>
              `;
            })
            .join("")
        : `<div class="lb-empty">No products selected for this lookbook yet.</div>`;

      return `
        <section class="lb-page">
          <div class="lb-hero">
            <div class="lb-hero-text">
              <p class="lb-hero-line">Relief.</p>
              <p class="lb-hero-line accent">Compression.</p>
              <p class="lb-hero-line">Recovery.</p>
              <p class="lb-hero-sub">Built for those who spend all day on their feet.</p>
            </div>
            <div class="lb-lockup">
              ${buyerLogoMarkup}
              <span class="lb-lockup-x">x</span>
              ${sickfitLogoMarkup}
            </div>
          </div>
          <hr class="lb-divider" />
          <h2 class="lb-section-title">${escapeHtml(params.accountName)} Product Lineup</h2>
          <div class="lb-grid">${cardsMarkup}</div>
          <div class="lb-footer">
            <span>Compression Socks &middot; Built for the Grind</span>
            <span>www.sickfitofficial.com | sales@sickfitofficial.com</span>
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(params.accountName)} SickFit Lookbook</title>
        <style>${getLookbookDocumentFontImport()}</style>
        <style>${getLookbookDocumentFontStyles()}${getLookbookDocumentStyles()}</style>
      </head>
      <body>
        ${pagesMarkup}
      </body>
    </html>
  `;
}
