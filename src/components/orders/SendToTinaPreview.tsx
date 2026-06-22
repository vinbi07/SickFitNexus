import { useState } from "react";
import type { PoLineItem, PurchaseOrder, SockCard } from "@/types/domain";
import { buildManufacturerOrderText, STANDING_INSTRUCTIONS } from "@/utils/manufacturerOrderDocument";
import { downloadManufacturerFilesZip } from "@/utils/downloadManufacturerFiles";
import { exportPoLineItemsExcel } from "@/utils/exportPoLineItemsExcel";

type Props = {
  purchaseOrder: PurchaseOrder;
  lines: PoLineItem[];
  sockCards: SockCard[];
};

export function SendToTinaPreview({ purchaseOrder, lines, sockCards }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const text = buildManufacturerOrderText(purchaseOrder, lines, sockCards);

  const hasFiles = lines.some((l) => l.mockup_file_ref || l.artwork_file_ref);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  function handleExportExcel() {
    setExporting(true);
    try {
      exportPoLineItemsExcel(lines, purchaseOrder);
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadFiles() {
    setDownloading(true);
    try {
      await downloadManufacturerFilesZip(lines, purchaseOrder.po_number ?? "PO");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Output</p>
          <h3>Send to Tina</h3>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {hasFiles && (
            <button type="button" className="btn btn-ghost btn-small" disabled={downloading} onClick={() => void handleDownloadFiles()}>
              {downloading ? "Zipping…" : "Download Files"}
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-small" disabled={exporting} onClick={handleExportExcel}>
            {exporting ? "Exporting…" : "Export Excel"}
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy Text"}
          </button>
        </div>
      </div>

      <pre className="mfr-send-pre">{text}</pre>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <div>
            <p className="lookbook-kicker">Fixed Block</p>
            <h3>Standing Instructions (sent with every order)</h3>
          </div>
        </div>
        <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
          {STANDING_INSTRUCTIONS.map((instr, i) => (
            <li key={i} style={{ fontSize: 12, lineHeight: 1.5 }}>
              {instr}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
