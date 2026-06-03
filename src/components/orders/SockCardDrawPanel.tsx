import type { PoLineItem, SockCard } from "@/types/domain";
import { sockCardService } from "@/services/sockCardService";

type Props = {
  lines: Array<Partial<PoLineItem>>;
  sockCards: SockCard[];
};

export function SockCardDrawPanel({ lines, sockCards }: Props) {
  const draw = sockCardService.calculateCardDraw(lines, sockCards);

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
                <td style={{ textAlign: "right", fontFamily: "monospace" }}>{entry.onHand}</td>
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
        Cards used = pairs ÷ pack size (rounded up). On-hand syncs from sock_cards table.
      </p>
    </div>
  );
}
