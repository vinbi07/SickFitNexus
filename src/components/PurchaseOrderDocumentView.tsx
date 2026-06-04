import type { Invoice, InvoiceLineItem, PoLineItem, PurchaseOrder } from "@/types/domain";
import {
  buildInvoiceDocumentModel,
  buildPurchaseOrderDocumentModel,
  formatPoCurrency,
  getPurchaseOrderDocumentStyles,
  type PurchaseOrderDocumentModel,
} from "@/utils/purchaseOrderDocument";

function DocumentModelRenderer({ documentModel }: { documentModel: PurchaseOrderDocumentModel }) {
  return (
    <div className="po-wrap">
      <style>{getPurchaseOrderDocumentStyles()}</style>
      <div className="po-doc">
        <div className="po-head">
          <div className="l">
            <div className="sf">
              <img src={documentModel.logoSrc} alt="SickFit logo" />
            </div>
            <div>
              <div className="title">SICKFIT</div>
              <div className="titlesub">{documentModel.documentTitle}</div>
            </div>
          </div>
          <div className="r">
            <div>1000 Ballpark Way</div>
            <div>Arlington, TX 76011</div>
            <div>sales@sickfitofficial.com</div>
          </div>
        </div>
        <div className="po-meta">
          <div><div className="lab">{documentModel.numberLabel}</div><div className="val">{documentModel.poNumber}</div></div>
          <div><div className="lab">Order Date</div><div className="val">{documentModel.orderDate}</div></div>
          <div><div className="lab">Start Ship</div><div className="val">{documentModel.startShipDate}</div></div>
          <div><div className="lab">Ship Complete</div><div className="val">{documentModel.shipCompleteDate}</div></div>
          <div><div className="lab">Currency</div><div className="val">{documentModel.currency}</div></div>
        </div>
        <div className="po-addr">
          <div>
            <div className="lab">Bill To</div>
            <div className="name">{documentModel.billToName}</div>
            {documentModel.billToLines.map((line) => <div key={`bill-${line}`} className="row">{line}</div>)}
          </div>
          <div>
            <div className="lab">Ship To</div>
            <div className="name">{documentModel.shipToName}</div>
            {documentModel.shipToLines.map((line) => <div key={`ship-${line}`} className="row">{line}</div>)}
          </div>
        </div>
        <div className="po-terms">
          <div><div className="lab">Payment Terms</div><div className="val">{documentModel.paymentTerms}</div></div>
          <div><div className="lab">Buyer</div><div className="val">{documentModel.buyerName}</div></div>
          <div><div className="lab">Approver</div><div className="val">{documentModel.approverName}</div></div>
        </div>
        <div className="po-items">
          <table className="po-table">
            <colgroup>
              <col className="col-n" />
              <col className="col-sku" />
              <col className="col-description" />
              <col className="col-upc" />
              <col className="col-unit" />
              <col className="col-qty" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-money" />
              <col className="col-money-wide" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>SKU</th>
                <th>Description</th>
                <th>UPC</th>
                <th>Unit</th>
                <th className="r">Qty</th>
                <th className="r">Unit Cost</th>
                <th className="r">Ext. Cost</th>
                <th className="r"><strong>Suggested</strong> <strong>Retail</strong></th>
                <th className="r">Ext. Retail</th>
              </tr>
            </thead>
            <tbody>
              {documentModel.lines.map((line) => (
                <tr key={`${line.sku}-${line.index}`}>
                  <td className="n">{line.index}</td>
                  <td className="code">{line.sku}</td>
                  <td>{line.description}</td>
                  <td className="code">{line.upc}</td>
                  <td className="r">{line.unit}</td>
                  <td className="r">{line.quantity}</td>
                  <td className="r">{formatPoCurrency(line.unitCost)}</td>
                  <td className="r">{formatPoCurrency(line.extendedCost)}</td>
                  <td className="r">{formatPoCurrency(line.unitRetail)}</td>
                  <td className="r">{formatPoCurrency(line.extendedRetail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="po-totals">
          <div><div className="lab">Total Units</div><div className="val">{documentModel.totalUnits}</div></div>
          <div><div className="lab">Total Gross Cost</div><div className="val">{formatPoCurrency(documentModel.totalGrossCost)}</div></div>
          <div><div className="lab">Total Cost</div><div className="val">{formatPoCurrency(documentModel.totalCost)}</div></div>
          <div><div className="lab">Total Suggested Retail</div><div className="val accent">{formatPoCurrency(documentModel.totalRetail)}</div></div>
        </div>
        <div className="po-notes">
          <div className="lab">Notes / Special Instructions</div>
          <div className="note">{documentModel.notes}</div>
        </div>
        <div className="po-foot">
          <span>{documentModel.footerLabel}</span>
          <span>PAGE 1 OF 1</span>
        </div>
      </div>
    </div>
  );
}

export function PurchaseOrderDocumentView({
  purchaseOrder,
  lineItems,
}: {
  purchaseOrder: PurchaseOrder;
  lineItems: PoLineItem[];
}) {
  const documentModel = buildPurchaseOrderDocumentModel(
    purchaseOrder,
    lineItems,
    purchaseOrder.buyers ?? null,
    purchaseOrder.retailers ?? null,
  );
  return <DocumentModelRenderer documentModel={documentModel} />;
}

export function InvoiceDocumentView({
  invoice,
  lineItems,
}: {
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
}) {
  const documentModel = buildInvoiceDocumentModel(
    invoice,
    lineItems,
    invoice.buyers ?? null,
    invoice.retailers ?? null,
  );
  return <DocumentModelRenderer documentModel={documentModel} />;
}
