import type { PoLineItem, PurchaseOrder, SockCard } from "@/types/domain";

export const STANDING_INSTRUCTIONS = [
  "ALL socks: SickFit embroidered on Rib (Left and Right) AND SickFit on Toe. No exceptions.",
  "Shipping method AIR, EXPRESS, SEA.",
  "Pack size: 1 pair per retail unit / 12 units per case pack unless explicitly stated otherwise on this form.",
  "Do NOT ship any SKU requiring a barcode until SickFit has confirmed barcode art approval in writing.",
  "Any SKU showing NEEDED in the art column: STOP production and contact SickFit immediately.",
  "No units ship without completed QC inspection and written sign-off from SickFit.",
  "Any substitution, delay, or production issue must be communicated to SickFit via email within 24 hours.",
];

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function flag(val: boolean | null | undefined, label: string) {
  return val ? label : null;
}

export function buildManufacturerOrderText(
  po: PurchaseOrder,
  lines: PoLineItem[],
  sockCards: SockCard[],
): string {
  const cardById = new Map(sockCards.map((c) => [c.id, c]));

  const lineBlocks = lines.map((line, i) => {
    const card = line.sock_card_id ? cardById.get(line.sock_card_id) : null;
    const qty = Number(line.quantity_ordered ?? 0);
    const exw = Number(line.unit_cost ?? 1.89);
    const lineCost = qty * exw;
    const cardsUsed = line.cards_used ?? 0;

    const feats = [
      flag(line.rib_lr, "rib L/R"),
      flag(line.toe, "toe"),
      flag(line.pattern, "pattern"),
      flag(line.signature, "signature"),
    ].filter(Boolean).join(", ");

    const bc = !line.barcode_required ? "NA" : (String(line.upc ?? "").trim() || "[ASSIGN UPC]");

    return [
      `${i + 1}. ${line.product_name || "[NAME]"}  |  ${line.variant_label || "-"}  |  Box ${line.box_no || "-"}`,
      `   Package as: ${card?.name ?? line.sock_card_id ?? "-"} | ${line.construction || "-"} | Size: ${line.sock_size || card?.size || "-"}`,
      `   ${qty} pairs @ ${money(exw)} = ${money(lineCost)}  (${cardsUsed} retail pack${cardsUsed !== 1 ? "s" : ""})`,
      `   Pantone: ${line.pantone || "-"} | Embroidery: ${feats || "none"}`,
      line.foot_text ? `   Foot text: ${line.foot_text}` : null,
      `   Barcode: ${bc} | Art: ${line.art_note || "-"} (${line.art_status || "NEEDED"})`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const totalPairs = lines.reduce((sum, l) => sum + Number(l.quantity_ordered ?? 0), 0);
  const totalGoods = lines.reduce((sum, l) => sum + Number(l.extended_cost ?? 0), 0);

  const header = [
    "SICKFIT — MANUFACTURER PRODUCTION ORDER",
    `To: Tina, Foshan Lion King Clothing Co., Ltd.`,
    `PO Number: ${po.po_number}`,
    `Order Date: ${po.order_date ?? "-"}`,
    po.ship_date ? `Req. Ship Date: ${po.ship_date}` : null,
  ].filter(Boolean).join("\n");

  const totals = [
    "──────────────────────────────────────────",
    `Total pairs: ${totalPairs}   Goods (EXW): ${money(totalGoods)}`,
    "Shipping: please quote",
    `GRAND TOTAL (EXW): ${money(totalGoods)}`,
  ].join("\n");

  const instructions = [
    "",
    "STANDING INSTRUCTIONS — READ BEFORE PRODUCTION",
    ...STANDING_INSTRUCTIONS.map((t, i) => `${i + 1}. ${t}`),
  ].join("\n");

  return [header, "", lineBlocks, "", totals, instructions].join("\n");
}

export function buildManufacturerOrderHtml(
  po: PurchaseOrder,
  lines: PoLineItem[],
  sockCards: SockCard[],
): string {
  const text = buildManufacturerOrderText(po, lines, sockCards);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Manufacturer PO ${po.po_number}</title>
<style>body{font-family:monospace;font-size:13px;line-height:1.6;padding:24px;background:#fff;color:#111}
pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${escaped}</pre></body></html>`;
}
