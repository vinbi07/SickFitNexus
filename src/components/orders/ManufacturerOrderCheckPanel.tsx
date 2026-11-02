import { CircleAlert, CircleCheck, OctagonX } from "lucide-react";
import type { PoLineItem, ProductBarcode, SockCard } from "@/types/domain";
import { validateManufacturerOrder, type ManufacturerOrderIssue } from "@/utils/manufacturerOrderValidation";

type Props = {
  lines: Array<Partial<PoLineItem>>;
  sockCards: SockCard[];
  /** GS1 barcode book; when given, each UPC is checked against it. */
  barcodeBook?: ProductBarcode[];
};

function IssueRow({ issue }: { issue: ManufacturerOrderIssue }) {
  const linePrefix = issue.lineIndex !== undefined ? `Line ${issue.lineIndex + 1}: ` : "";
  if (issue.severity === "stop") {
    return (
      <li className="mfr-issue-stop">
        <OctagonX className="mfr-issue-icon" size={15} aria-label="Stop" />
        {linePrefix}{issue.message}
      </li>
    );
  }
  return (
    <li className="mfr-issue-warn">
      <CircleAlert className="mfr-issue-icon" size={15} aria-label="Warning" />
      {linePrefix}{issue.message}
    </li>
  );
}

export function ManufacturerOrderCheckPanel({ lines, sockCards, barcodeBook = [] }: Props) {
  const issues = validateManufacturerOrder(lines, sockCards, barcodeBook);
  const stops = issues.filter((i) => i.severity === "stop").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const clean = issues.length === 0;

  return (
    <div className={`panel${clean ? " mfr-check-clean" : ""}`}>
      <div className="panel-header">
        <div>
          <h3>Order check</h3>
          {!clean ? (
            <p className="mfr-check-counts">
              {stops > 0 ? <span className="danger-text">{stops} stop{stops > 1 ? "s" : ""}</span> : null}
              {warnings > 0 ? <span className="mfr-check-warn-count">{warnings} warning{warnings > 1 ? "s" : ""}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      {clean ? (
        <p className="mfr-check-pass">
          <CircleCheck size={16} aria-hidden="true" />
          All checks passed. Safe to send.
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
