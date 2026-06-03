import { useState } from "react";
import type { PoLineItem, PurchaseOrder, SockCard } from "@/types/domain";
import { buildManufacturerOrderText, STANDING_INSTRUCTIONS } from "@/utils/manufacturerOrderDocument";

type Props = {
  purchaseOrder: PurchaseOrder;
  lines: PoLineItem[];
  sockCards: SockCard[];
};

export function SendToTinaPreview({ purchaseOrder, lines, sockCards }: Props) {
  const [copied, setCopied] = useState(false);

  const text = buildManufacturerOrderText(purchaseOrder, lines, sockCards);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Output</p>
          <h3>Send to Tina</h3>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={handleCopy}>
          {copied ? "Copied ✓" : "Copy Text"}
        </button>
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
