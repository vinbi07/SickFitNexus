import JSZip from "jszip";
import type { PoLineItem } from "@/types/domain";

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function extFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split("/").pop() ?? "";
    const dot = last.lastIndexOf(".");
    return dot !== -1 ? last.slice(dot) : "";
  } catch {
    return "";
  }
}

function lineBaseName(line: PoLineItem, index: number): string {
  const n = (line.sort_order ?? index) + 1;
  const name = sanitize(String(line.product_name ?? "Design"));
  const variant = sanitize(String(line.variant_label || line.pantone || line.construction || ""));
  return variant ? `Line${n}_${name}_${variant}` : `Line${n}_${name}`;
}

export async function downloadManufacturerFilesZip(lines: PoLineItem[], poNumber: string): Promise<void> {
  type FileEntry = { url: string; filename: string };
  const entries: FileEntry[] = [];

  lines.forEach((line, index) => {
    const base = lineBaseName(line, index);
    if (line.mockup_file_ref) {
      entries.push({ url: line.mockup_file_ref, filename: `${base}_mockup${extFromUrl(line.mockup_file_ref)}` });
    }
    if (line.artwork_file_ref) {
      entries.push({ url: line.artwork_file_ref, filename: `${base}_artwork${extFromUrl(line.artwork_file_ref)}` });
    }
  });

  if (entries.length === 0) return;

  const zip = new JSZip();
  let added = 0;

  await Promise.all(
    entries.map(async ({ url, filename }) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        zip.file(filename, blob);
        added++;
      } catch {
        // skip failed files silently
      }
    }),
  );

  if (added === 0) return;

  const blob = await zip.generateAsync({ type: "blob" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `MFR_PO_${sanitize(poNumber)}_files.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}
