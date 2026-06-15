import { useState } from "react";
import type { PoLineItem, SockCard } from "@/types/domain";
import { sockCardService } from "@/services/sockCardService";

type Props = {
  lines: Array<Partial<PoLineItem>>;
  sockCards: SockCard[];
  onUpdateCard?: (id: string, onHand: number) => void;
};

export function SockCardDrawPanel({ lines, sockCards, onUpdateCard }: Props) {
  const draw = sockCardService.calculateCardDraw(lines, sockCards);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(cardId: string, currentOnHand: number) {
    setEditing(cardId);
    setDraftValue(String(currentOnHand));
  }

  async function commitEdit(cardId: string) {
    const parsed = parseInt(draftValue, 10);
    if (isNaN(parsed) || parsed < 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await sockCardService.updateCard(cardId, { on_hand: parsed });
      onUpdateCard?.(cardId, parsed);
    } finally {
      setSaving(false);
      setEditing(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, cardId: string) {
    if (e.key === "Enter") void commitEdit(cardId);
    if (e.key === "Escape") setEditing(null);
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Packaging</p>
          <h3>Sock Card Draw</h3>
        </div>
      </div>

      {draw.length === 0 ? (
        <p style={{ color: "var(--color-muted, #888)", fontSize: 13, padding: "8px 0" }}>
          No cards drawn yet.
        </p>
      ) : (
        <table className="mfr-draw-table">
          <thead>
            <tr>
              <th>Card</th>
              <th style={{ textAlign: "right" }}>Used</th>
              <th style={{ textAlign: "right" }}>On Hand</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {draw.map((entry) => (
              <tr key={entry.sockCardId}>
                <td>{entry.cardName}</td>
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{entry.cardsUsed}</td>
                <td style={{ textAlign: "right" }}>
                  {editing === entry.sockCardId ? (
                    <input
                      type="number"
                      min={0}
                      value={draftValue}
                      disabled={saving}
                      autoFocus
                      onChange={(e) => setDraftValue(e.target.value)}
                      onBlur={() => void commitEdit(entry.sockCardId)}
                      onKeyDown={(e) => handleKeyDown(e, entry.sockCardId)}
                      style={{ width: 80, fontFamily: "monospace", textAlign: "right", fontSize: 13 }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(entry.sockCardId, entry.onHand)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "monospace",
                        fontSize: 13,
                        color: entry.onHand === 0 ? "var(--color-danger, #c0392b)" : "inherit",
                        padding: "2px 4px",
                        borderRadius: 3,
                        textDecoration: "underline dotted",
                      }}
                      title="Click to edit on-hand quantity"
                    >
                      {entry.onHand}
                    </button>
                  )}
                </td>
                <td>
                  {entry.status === "ok" && (
                    <span className="status-badge status-badge-green">{entry.remaining} left</span>
                  )}
                  {entry.status === "low" && (
                    <span className="status-badge status-badge-yellow">{entry.remaining} low</span>
                  )}
                  {entry.status === "short" && (
                    <span className="status-badge status-badge-red">short {Math.abs(entry.remaining)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ fontSize: 11, color: "var(--color-muted, #888)", marginTop: 10, lineHeight: 1.5 }}>
        Cards used = pairs ÷ pack size (rounded up). Click On Hand to edit.
      </p>
    </div>
  );
}
