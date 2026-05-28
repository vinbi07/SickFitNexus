import type { PoLineItem, PurchaseOrder } from "@/types/domain";
import {
  buildPurchaseOrderDocumentModel,
  formatPoCurrency,
  getPurchaseOrderDocumentStyles,
} from "@/utils/purchaseOrderDocument";

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

  return (
    <div className="po-wrap">
      <style>{getPurchaseOrderDocumentStyles()}</style>
      <div className="po-banner">
        <span>{documentModel.banner}</span>
      </div>
      <div className="po-doc">
        <div className="po-head">
          <div className="l">
            <div className="sf">
              <img src={documentModel.logoSrc} alt="SickFit logo" />
            </div>
            <div>
              <div className="title">SICKFIT</div>
              <div className="titlesub">Purchase Order</div>
            </div>
          </div>
          <div className="r">
            <div>1000 Ballpark Way</div>
            <div>Arlington, TX 76011</div>
            <div>sales@sickfitofficial.com</div>
          </div>
        </div>
        <div className="po-meta">
          <div><div className="lab">PO Number</div><div className="val">{documentModel.poNumber}</div></div>
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
          <div className="h">
            <div>#</div>
            <div>SKU</div>
            <div>Description</div>
            <div>UPC</div>
            <div>Unit</div>
            <div className="r">Qty</div>
            <div className="r">Unit Cost</div>
            <div className="r">Ext. Cost</div>
            <div className="r">Unit Retail</div>
            <div className="r">Ext. Retail</div>
          </div>
          {documentModel.lines.map((line) => (
            <div key={`${line.sku}-${line.index}`} className="row">
              <div className="n">{line.index}</div>
              <div className="code">{line.sku}</div>
              <div>{line.description}</div>
              <div className="code">{line.upc}</div>
              <div className="r">{line.unit}</div>
              <div className="r">{line.quantity}</div>
              <div className="r">{formatPoCurrency(line.unitCost)}</div>
              <div className="r">{formatPoCurrency(line.extendedCost)}</div>
              <div className="r">{formatPoCurrency(line.unitRetail)}</div>
              <div className="r">{formatPoCurrency(line.extendedRetail)}</div>
            </div>
          ))}
        </div>
        <div className="po-totals">
          <div><div className="lab">Total Units</div><div className="val">{documentModel.totalUnits}</div></div>
          <div><div className="lab">Total Cost</div><div className="val">{formatPoCurrency(documentModel.totalCost)}</div></div>
          <div><div className="lab">Total Retail</div><div className="val accent">{formatPoCurrency(documentModel.totalRetail)}</div></div>
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
