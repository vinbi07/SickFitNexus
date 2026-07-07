import { previewHtmlDocument, printHtmlDocument } from "@/utils/printDocument";

export function generateLookbookPdfName(accountName: string, date: Date = new Date()) {
  const slug = accountName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "account";
  const dateStamp = date.toISOString().slice(0, 10);
  return `sickfit-lookbook-${slug}-${dateStamp}`;
}

export function printLookbookDocument(fullHtml: string) {
  printHtmlDocument(fullHtml);
}

export function previewLookbookDocument(fullHtml: string) {
  previewHtmlDocument(fullHtml);
}
