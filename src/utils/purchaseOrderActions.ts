import { getPurchaseOrderDocumentFontStyles, getPurchaseOrderDocumentStyles } from "@/utils/purchaseOrderDocument";

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

function openDocumentWindow(title: string, bodyHtml: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Popup blocked. Allow popups to preview or print the PO.");
  popup.document.open();
  popup.document.write(buildDocumentHtml(title, bodyHtml));
  popup.document.close();
  return popup;
}

async function waitForDocumentAssets(document: Document, view: Window) {
  await new Promise<void>((resolve) => {
    view.setTimeout(() => resolve(), 50);
  });
  await document.fonts?.ready;

  const imageLoads = Array.from(document.images)
    .filter((image) => !image.complete)
    .map((image) => new Promise<void>((resolve) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => resolve(), { once: true });
    }));

  if (imageLoads.length) {
    await Promise.allSettled(imageLoads);
  }
}

export function printPurchaseOrderDocument(title: string, bodyHtml: string) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error("Unable to open the browser print view for this purchase order.");
  }

  frameDocument.open();
  frameDocument.write(buildDocumentHtml(title, bodyHtml));
  frameDocument.close();

  void waitForDocumentAssets(frameDocument, frameWindow).finally(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => iframe.remove(), 1000);
  });
}

export function previewPurchaseOrderDocument(title: string, bodyHtml: string) {
  const popup = openDocumentWindow(title, bodyHtml);
  popup.focus();
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
