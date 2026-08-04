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
  href: "/purchase-orders/new/wizard",
};

const MO_CARD: DocumentTypeCard = {
  id: "manufacturing-order",
  title: "Manufacturing Order",
  description: "An order SickFit sends to a manufacturer to produce inventory.",
  href: "/manufacturing-orders/new/wizard",
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
          A bill sent to a customer — normally based on an existing Purchase
          Order, with an option to create one manually.
        </p>
        {invoiceExpanded ? (
          <div className="btn-row">
            <Link className="btn btn-primary" to="/invoices/new/wizard">
              From Purchase Order
            </Link>
            <Link className="btn btn-secondary" to="/invoices/new/wizard?mode=manual">
              Create Manually
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
