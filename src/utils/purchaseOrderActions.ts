import { getPurchaseOrderDocumentStyles } from "@/utils/purchaseOrderDocument";

function openDocumentWindow(title: string, bodyHtml: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Popup blocked. Allow popups to preview or print the PO.");
  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { margin: 0; padding: 24px; background: #f3f4f6; }
          ${getPurchaseOrderDocumentStyles()}
          @media print {
            body { padding: 0; background: white; }
          }
        </style>
      </head>
      <body>${bodyHtml}</body>
    </html>
  `);
  popup.document.close();
  return popup;
}

export function printPurchaseOrderDocument(title: string, bodyHtml: string) {
  const popup = openDocumentWindow(title, bodyHtml);
  popup.focus();
  popup.print();
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
