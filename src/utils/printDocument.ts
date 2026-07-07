function openDocumentWindow(fullHtml: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Popup blocked. Allow popups to preview or print this document.");
  popup.document.open();
  popup.document.write(fullHtml);
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

export function printHtmlDocument(fullHtml: string) {
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
    throw new Error("Unable to open the browser print view for this document.");
  }

  frameDocument.open();
  frameDocument.write(fullHtml);
  frameDocument.close();

  void waitForDocumentAssets(frameDocument, frameWindow).finally(() => {
    frameWindow.focus();
    frameWindow.print();
    window.setTimeout(() => iframe.remove(), 1000);
  });
}

export function previewHtmlDocument(fullHtml: string) {
  const popup = openDocumentWindow(fullHtml);
  popup.focus();
}
