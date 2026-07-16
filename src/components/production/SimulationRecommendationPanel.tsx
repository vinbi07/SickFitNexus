import { useState } from "react";
import { AlertOctagon, AlertTriangle, Info } from "lucide-react";
import type {
  ProductionRecommendation,
  RecommendationSeverity,
} from "@/types/domain";

const SEVERITY_META: Record<
  RecommendationSeverity,
  { label: string; icon: typeof AlertOctagon; className: string }
> = {
  critical: { label: "Critical", icon: AlertOctagon, className: "danger-text" },
  warning: {
    label: "Capacity / Coverage",
    icon: AlertTriangle,
    className: "warning-text",
  },
  info: { label: "Opportunity", icon: Info, className: "muted" },
};

export function SimulationRecommendationPanel({
  recommendations,
  onDismiss,
  onSelect,
  onQuickAction,
}: {
  recommendations: ProductionRecommendation[];
  onDismiss?: (recommendationId: string, note: string) => void;
  onSelect?: (productIds: string[]) => void;
  onQuickAction?: (recommendation: ProductionRecommendation) => void;
}) {
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const active = recommendations.filter((rec) => !rec.isDismissed);

  return (
    <div className="panel section-stack production-recommendation-panel">
      <div className="panel-header">
        <h3>Recommended Next Steps</h3>
        <span className="helper-text">{active.length} action(s)</span>
      </div>
      {active.length ? (
        active.map((rec) => {
          const meta = SEVERITY_META[rec.severity];
          const Icon = meta.icon;
          return (
            <div key={rec.id} className="rec">
              <div className="rec-top">
                <strong className={meta.className}>
                  <Icon
                    size={14}
                    aria-hidden
                    style={{ verticalAlign: "text-bottom", marginRight: 4 }}
                  />
                  {meta.label}
                </strong>
                <span className="helper-text">
                  {" "}
                  {rec.affectedProductIds.length} SKU(s)
                </span>
              </div>
              <p>
                <strong>{rec.title}</strong>
              </p>
              <p>{rec.explanation}</p>
              <p className="helper-text">{rec.impact}</p>
              <p className="helper-text">Suggested: {rec.suggestedAction}</p>
              <div className="btn-row">
                {onSelect && rec.affectedProductIds.length ? (
                  <button
                    className="btn btn-ghost btn-small"
                    onClick={() => onSelect(rec.affectedProductIds)}
                  >
                    View SKUs
                  </button>
                ) : null}
                {onDismiss ? (
                  dismissingId === rec.id ? (
                    <>
                      <input
                        placeholder="Reason for dismissing (optional)"
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          onDismiss(rec.id, note);
                          setDismissingId(null);
                          setNote("");
                        }}
                      >
                        Confirm Dismiss
                      </button>
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => setDismissingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-ghost btn-small"
                      onClick={() => setDismissingId(rec.id)}
                    >
                      Dismiss
                    </button>
                  )
                ) : null}
              </div>
            </div>
          );
        })
      ) : (
        <div className="empty-state">
          No open recommendations. This plan looks ready for review.
        </div>
      )}
    </div>
  );
}
