import type { PoLineItem } from "@/types/domain";
import { calculateManufacturingInventoryImpact } from "@/utils/operations";

export function InventoryImpactList({ lineItems }: { lineItems: PoLineItem[] }) {
  const impact = calculateManufacturingInventoryImpact(lineItems);
  if (!impact.length) return <span className="helper-text">No incoming inventory</span>;

  return (
    <ul className="inventory-impact-list">
      {impact.map((line) => (
        <li key={line.productName}>
          <span>{line.productName}</span>
          <strong>+{line.incomingUnits}</strong>
        </li>
      ))}
    </ul>
  );
}
