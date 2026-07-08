import type { PoLineItem, PurchaseOrder } from "@/types/domain";
import {
  buildManufacturerPoDocumentModel,
  formatPoCurrency,
  formatPoRetail,
  getPurchaseOrderDocumentStyles,
  type ManufacturerPoDocumentLine,
} from "@/utils/purchaseOrderDocument";

const MFR_DOC_COLUMNS: Array<{ key: keyof ManufacturerPoDocumentLine; label: string; numeric?: boolean; money?: boolean }> = [
  { key: "index", label: "#", numeric: true },
  { key: "productName", label: "Product Name" },
  { key: "variant", label: "Variant" },
  { key: "colorway", label: "Colorway" },
  { key: "construction", label: "Construction" },
  { key: "sku", label: "SKU" },
  { key: "upc", label: "UPC" },
  { key: "boxNo", label: "Box No" },
  { key: "sockSize", label: "Sock Size" },
  { key: "packPairs", label: "Pack Pairs", numeric: true },
  { key: "qtyOrdered", label: "Qty Ordered", numeric: true },
  { key: "unitCost", label: "Unit Cost", numeric: true, money: true },
  { key: "extendedCost", label: "Extended Cost", numeric: true, money: true },
  { key: "unitRetail", label: "Unit Retail", numeric: true, money: true },
  { key: "extendedRetail", label: "Extended Retail", numeric: true, money: true },
  { key: "barcodeRequired", label: "Barcode Required" },
  { key: "artStatus", label: "Art Status" },
  { key: "artNote", label: "Art Note" },
  { key: "ribLr", label: "Rib L/R" },
  { key: "toe", label: "Toe" },
  { key: "pattern", label: "Pattern" },
  { key: "signature", label: "Signature" },
  { key: "footText", label: "Foot Text" },
];

function cellValue(line: ManufacturerPoDocumentLine, col: typeof MFR_DOC_COLUMNS[number]): string {
  const raw = line[col.key];
  if (col.key === "unitRetail" || col.key === "extendedRetail") return formatPoRetail(Number(raw || 0));
  if (col.money) return formatPoCurrency(Number(raw || 0));
  return String(raw ?? "");
}

export function ManufacturerPoDocumentView({
  purchaseOrder,
  lineItems,
}: {
  purchaseOrder: PurchaseOrder;
  lineItems: PoLineItem[];
}) {
  const model = buildManufacturerPoDocumentModel(purchaseOrder, lineItems);
  const hasRetail = model.lines.some(
    (line) => Number(line.unitRetail || 0) > 0 || Number(line.extendedRetail || 0) > 0,
  );
  const columns = hasRetail
    ? MFR_DOC_COLUMNS
    : MFR_DOC_COLUMNS.filter((col) => col.key !== "unitRetail" && col.key !== "extendedRetail");

  return (
    <div className="po-wrap">
      <style>{getPurchaseOrderDocumentStyles()}</style>
      <div className="po-doc">
        <div className="po-head">
          <div className="l">
            <div className="sf">
              <img src={model.logoSrc} alt="SickFit logo" />
            </div>
            <div>
              <div className="title">SICKFIT</div>
              <div className="titlesub">{model.documentTitle}</div>
            </div>
          </div>
          <div className="r">
            <div>1000 Ballpark Way</div>
            <div>Arlington, TX 76011</div>
            <div>sales@sickfitofficial.com</div>
          </div>
        </div>
        <div className="po-meta">
          <div><div className="lab">{model.numberLabel}</div><div className="val">{model.poNumber}</div></div>
          <div><div className="lab">Order Date</div><div className="val">{model.orderDate}</div></div>
          <div><div className="lab">Start Ship</div><div className="val">{model.startShipDate}</div></div>
          <div><div className="lab">Ship Complete</div><div className="val">{model.shipCompleteDate}</div></div>
          <div><div className="lab">Currency</div><div className="val">{model.currency}</div></div>
        </div>
        <div className="po-items mfr-doc-scroll">
          <table className="po-table mfr-doc-table">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={col.numeric ? "r" : undefined}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.index}>
                  {columns.map((col) => (
                    <td key={col.key} className={col.numeric ? "r" : undefined}>{cellValue(line, col)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="po-totals">
          <div><div className="lab">Total Pairs</div><div className="val">{model.totalPairs}</div></div>
          <div><div className="lab">Total Goods (EXW)</div><div className="val accent">{formatPoCurrency(model.totalGoodsCost)}</div></div>
        </div>
        <div className="po-notes">
          <div className="lab">Notes / Special Instructions</div>
          <div className="note">{model.notes}</div>
        </div>
        <div className="po-foot">
          <span>{model.footerLabel}</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </div>
    </div>
  );
}
