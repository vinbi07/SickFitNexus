import { getPurchaseOrderDocumentFontStyles, getPurchaseOrderDocumentStyles } from "@/utils/purchaseOrderDocument";
import { previewHtmlDocument, printHtmlDocument } from "@/utils/printDocument";

function normalizeDocumentBodyHtml(bodyHtml: string) {
  return bodyHtml.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").trim();
}

function buildDocumentHtml(title: string, bodyHtml: string) {
  const normalizedBodyHtml = normalizeDocumentBodyHtml(bodyHtml);
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          ${getPurchaseOrderDocumentFontStyles()}
          @page { margin: 14mm; }
          html, body { margin: 0; }
          body { padding: 24px; background: #f3f4f6; box-sizing: border-box; }
          ${getPurchaseOrderDocumentStyles()}
          @media print {
            html, body { margin: 0; }
            body { padding: 1.5mm; background: white; box-sizing: border-box; }
            .po-wrap { padding: 0 !important; max-width: 100%; }
            .po-wrap, .po-doc {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .po-doc {
              width: 100%;
              max-width: 100%;
              break-inside: avoid;
              page-break-inside: avoid;
              border: 1px solid #cfc7ba !important;
              box-shadow: inset 0 0 0 1px #cfc7ba;
            }
            .po-head,
            .po-meta,
            .po-addr,
            .po-terms,
            .po-items .h,
            .po-totals,
            .po-notes,
            .po-foot {
              border-color: #d7d0c4 !important;
            }
          }
        </style>
      </head>
      <body>${normalizedBodyHtml}</body>
    </html>
  `;
}

export function printPurchaseOrderDocument(title: string, bodyHtml: string) {
  printHtmlDocument(buildDocumentHtml(title, bodyHtml));
}

export function previewPurchaseOrderDocument(title: string, bodyHtml: string) {
  previewHtmlDocument(buildDocumentHtml(title, bodyHtml));
}

export function downloadPurchaseOrderHtml(title: string, bodyHtml: string) {
  const blob = new Blob(
    [
      `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>${getPurchaseOrderDocumentStyles()}</style></head><body>${bodyHtml}</body></html>`,
    ],
    { type: "text/html;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.html`;
  anchor.click();
  URL.revokeObjectURL(url);
}
