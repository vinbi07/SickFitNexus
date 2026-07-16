import { InfoTooltip } from "@/components/Tooltip";
import type { Product, ProductionPlanItem } from "@/types/domain";
import type { ItemErrorField } from "@/utils/productionPlanValidation";
import { formatCurrency } from "@/utils/format";

type DraftItem = Partial<ProductionPlanItem> & { product_id: string };

export function ProductPlanItemRow({
  item,
  product,
  onUpdateField,
  // onEditSpecs, // Specs editing is temporarily disabled — see docs/production-planner-specs-deferred.md
  onRemove,
  fieldErrors,
}: {
  item: DraftItem;
  product: Product | null | undefined;
  onUpdateField: (productId: string, key: keyof ProductionPlanItem, value: unknown) => void;
  onEditSpecs?: () => void; // temporarily unused — see docs/production-planner-specs-deferred.md
  onRemove: () => void;
  fieldErrors?: Partial<Record<ItemErrorField, string>>;
}) {
  const estimatedCost = Number(item.planned_quantity ?? 0) * Number(item.unit_cost ?? 0);
  const errorFor = (field: ItemErrorField) => fieldErrors?.[field];

  return (
    <div className="plan-item-row">
      <div className="plan-item-thumb-shell">
        {product?.image_url ? (
          <img className="plan-item-thumb" src={product.image_url} alt={product.name} />
        ) : (
          <span className="plan-item-thumb-fallback">{product?.sku?.slice(0, 2) ?? "NA"}</span>
        )}
      </div>

      <div className="plan-item-name">
        <strong>{product?.name ?? item.product_id}</strong>
      </div>

      <div className="plan-item-fields">
        <div className={`plan-item-field${errorFor("planned_quantity") ? " has-error" : ""}`}>
          <label>
            Planned Qty
            <InfoTooltip content="How many units of this SKU this production run should produce." />
          </label>
          <input
            type="number"
            min={0}
            value={item.planned_quantity ?? 0}
            onChange={(event) => onUpdateField(item.product_id, "planned_quantity", Number(event.target.value))}
          />
          {errorFor("planned_quantity") ? <span className="field-error">{errorFor("planned_quantity")}</span> : null}
        </div>
        <div className={`plan-item-field${errorFor("moq") ? " has-error" : ""}`}>
          <label>
            MOQ
            <InfoTooltip content="The manufacturer's minimum order quantity for this SKU — the simulation rounds proposed quantities up to meet it." />
          </label>
          <input
            type="number"
            min={0}
            value={item.moq ?? ""}
            onChange={(event) => onUpdateField(item.product_id, "moq", event.target.value ? Number(event.target.value) : null)}
          />
          {errorFor("moq") ? <span className="field-error">{errorFor("moq")}</span> : null}
        </div>
        <div className={`plan-item-field${errorFor("order_increment") ? " has-error" : ""}`}>
          <label>
            Increment
            <InfoTooltip content="The case-pack or order increment this SKU must be ordered in multiples of." />
          </label>
          <input
            type="number"
            min={0}
            value={item.order_increment ?? ""}
            onChange={(event) => onUpdateField(item.product_id, "order_increment", event.target.value ? Number(event.target.value) : null)}
          />
          {errorFor("order_increment") ? <span className="field-error">{errorFor("order_increment")}</span> : null}
        </div>
        <div className={`plan-item-field${errorFor("unit_cost") ? " has-error" : ""}`}>
          <label>
            Unit Cost
            <InfoTooltip content="Cost per unit from this manufacturer, used to calculate this line's estimated cost and the plan's total." />
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={item.unit_cost ?? ""}
            onChange={(event) => onUpdateField(item.product_id, "unit_cost", event.target.value ? Number(event.target.value) : null)}
          />
          {errorFor("unit_cost") ? <span className="field-error">{errorFor("unit_cost")}</span> : null}
        </div>
        <div className="plan-item-field">
          <label>
            Est. Cost
            <InfoTooltip content="Planned Qty × Unit Cost — calculated automatically, not editable." />
          </label>
          <span className="plan-item-est-cost">{formatCurrency(estimatedCost)}</span>
        </div>
      </div>

      <div className="plan-item-actions btn-row">
        {/* Specs editing is temporarily disabled — see docs/production-planner-specs-deferred.md
        <button className="btn btn-ghost btn-small" onClick={onEditSpecs}>
          Specs
        </button>
        */}
        <button className="btn btn-danger btn-small" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
