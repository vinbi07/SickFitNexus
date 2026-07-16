import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { SkuRiskMatrixPoint } from "@/types/domain";

function toneFor(point: SkuRiskMatrixPoint) {
  if (point.isStockoutRisk) return { color: "#e72027", label: "Stockout risk" };
  if (point.isOverproduced) return { color: "#945f08", label: "Overproduced" };
  return { color: "#2958b3", label: "On track" };
}

function RiskTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SkuRiskMatrixPoint }> }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const tone = toneFor(point);
  return (
    <div className="chart-tooltip">
      <strong>{point.productName}</strong>
      <div>{point.sku}</div>
      <div>Urgency {point.urgencyScore} · Impact {point.impactScore}</div>
      <div>{tone.label}</div>
    </div>
  );
}

/**
 * Urgency (stockout risk) vs business impact. Points are both colored AND shaped
 * differently by risk category so status is never conveyed by color alone. Clicking
 * a point calls onSelect so the SKU table/detail can focus on that product.
 */
export function SkuRiskMatrix({
  points,
  selectedProductId,
  onSelect,
}: {
  points: SkuRiskMatrixPoint[];
  selectedProductId?: string | null;
  onSelect?: (productId: string) => void;
}) {
  if (!points.length) {
    return (
      <div className="panel">
        <div className="panel-header"><h3>SKU Risk Matrix</h3></div>
        <div className="empty-state">No SKUs in this plan yet.</div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-header"><h3>SKU Risk Matrix</h3></div>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="urgencyScore" name="Stockout urgency" domain={[0, 100]} label={{ value: "Stockout urgency", position: "insideBottom", offset: -4, fontSize: 11 }} />
            <YAxis type="number" dataKey="impactScore" name="Business impact" domain={[0, 100]} label={{ value: "Business impact", angle: -90, position: "insideLeft", fontSize: 11 }} />
            <ZAxis range={[80, 80]} />
            <Tooltip content={<RiskTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={points} onClick={(entry) => onSelect?.((entry as unknown as SkuRiskMatrixPoint).productId)} cursor={onSelect ? "pointer" : undefined}>
              {points.map((point) => {
                const tone = toneFor(point);
                const isSelected = selectedProductId === point.productId;
                return (
                  <Cell
                    key={point.productId}
                    fill={tone.color}
                    stroke={isSelected ? "#101828" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-text-summary">
        {points.filter((point) => point.isStockoutRisk).length} SKU(s) carry stockout risk, {points.filter((point) => point.isOverproduced).length} are flagged as overproduced. Click a point to focus that SKU below.
      </p>
    </div>
  );
}
