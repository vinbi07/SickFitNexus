import type { PoLineItem, SockCard } from "@/types/domain";
import { validateManufacturerOrder, type ManufacturerOrderIssue } from "@/utils/manufacturerOrderValidation";

type Props = {
  lines: Array<Partial<PoLineItem>>;
  sockCards: SockCard[];
};

function IssueRow({ issue }: { issue: ManufacturerOrderIssue }) {
  const linePrefix = issue.lineIndex !== undefined ? `Line ${issue.lineIndex + 1}: ` : "";
  if (issue.severity === "stop") {
    return (
      <li className="mfr-issue-stop">
        <span className="mfr-issue-icon">⛔</span>
        {linePrefix}{issue.message}
      </li>
    );
  }
  return (
    <li className="mfr-issue-warn">
      <span className="mfr-issue-icon">⚠</span>
      {linePrefix}{issue.message}
    </li>
  );
}

export function ManufacturerOrderCheckPanel({ lines, sockCards }: Props) {
  const issues = validateManufacturerOrder(lines, sockCards);
  const stops = issues.filter((i) => i.severity === "stop").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const clean = issues.length === 0;

  return (
    <div className={`panel${clean ? " mfr-check-clean" : ""}`}>
      <div className="panel-header">
        <div>
          <p className="lookbook-kicker">Validation</p>
          <h3>
            Order Check
            {!clean && (
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 400 }}>
                {stops > 0 && <span style={{ color: "var(--color-danger, #c0392b)" }}> {stops} STOP{stops > 1 ? "S" : ""}</span>}
                {warnings > 0 && <span style={{ color: "var(--color-warning, #e67e22)" }}> {warnings} warning{warnings > 1 ? "s" : ""}</span>}
              </span>
            )}
          </h3>
        </div>
      </div>

      {clean ? (
        <p style={{ color: "var(--color-success, #27ae60)", fontSize: 13 }}>
          ✓ All checks passed. Safe to send.
        </p>
      ) : (
        <ul className="mfr-issue-list">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}
