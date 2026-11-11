import { useState } from "react";
import { Link } from "react-router-dom";

type DocumentTypeCard = {
  id: string;
  title: string;
  description: string;
  href?: string;
};

const PO_CARD: DocumentTypeCard = {
  id: "purchase-order",
  title: "Purchase Order",
  description: "An order received from a retailer or wholesale customer.",
  href: "/purchase-orders/new/wizard?type=retailer",
};

const MO_CARD: DocumentTypeCard = {
  id: "manufacturing-order",
  title: "Manufacturing Order",
  description: "An order SickFit sends to a manufacturer to produce inventory.",
  href: "/purchase-orders/new?type=manufacturer",
};

export function DocumentTypeSelector() {
  const [invoiceExpanded, setInvoiceExpanded] = useState(false);

  return (
    <div className="card-grid">
      <DocumentCard card={PO_CARD} />
      <DocumentCard card={MO_CARD} />

      <div className="card">
        <h3>Invoice</h3>
        <p>
          A bill sent to a customer. Import a retailer's PO PDF to create the
          POs and invoices together, or convert a Purchase Order already in Nexus.
        </p>
        {invoiceExpanded ? (
          <div className="btn-row">
            <Link className="btn btn-primary" to="/purchase-orders/import-pdf">
              From PO PDF
            </Link>
            <Link className="btn btn-secondary" to="/purchase-orders">
              From existing Purchase Order
            </Link>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setInvoiceExpanded(true)}
          >
            Choose Invoice Type
          </button>
        )}
      </div>
    </div>
  );
}

function DocumentCard({ card }: { card: DocumentTypeCard }) {
  return (
    <div className="card">
      <h3>{card.title}</h3>
      <p>{card.description}</p>
      <Link className="btn btn-primary" to={card.href ?? "#"}>
        Get Started
      </Link>
    </div>
  );
}
