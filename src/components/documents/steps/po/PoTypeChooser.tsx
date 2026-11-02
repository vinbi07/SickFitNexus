import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";

export type PoTypeChoice = "retailer" | "manufacturer";

const OPTIONS: { id: PoTypeChoice; title: string; description: string; detail: string }[] = [
  {
    id: "retailer",
    title: "Retailer PO",
    description: "An order a retailer or wholesale customer places with SickFit.",
    detail: "Retailer, buyer, ship-to and bill-to addresses, products and case packs.",
  },
  {
    id: "manufacturer",
    title: "Manufacturer Order",
    description: "An order SickFit sends to the factory to produce socks.",
    detail: "Designs, sock cards and packaging, then a production timeline once it's paid.",
  },
];

/** First step of "New PO": pick which kind of purchase order to create. */
export function PoTypeChooser({ onContinue }: { onContinue: (choice: PoTypeChoice) => void }) {
  const [choice, setChoice] = useState<PoTypeChoice | null>(null);

  return (
    <div className="section-stack">
      <PageHeader title="New Purchase Order" description="What kind of purchase order are you creating?" />
      <div className="po-type-grid" role="radiogroup" aria-label="Purchase order type">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={choice === option.id}
            className={`card po-type-card${choice === option.id ? " is-selected" : ""}`}
            onClick={() => setChoice(option.id)}
            onDoubleClick={() => onContinue(option.id)}
          >
            <h3>{option.title}</h3>
            <p>{option.description}</p>
            <span className="helper-text">{option.detail}</span>
          </button>
        ))}
      </div>
      <div className="btn-row">
        <Link className="btn btn-secondary" to="/purchase-orders">
          Cancel
        </Link>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!choice}
          onClick={() => choice && onContinue(choice)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
