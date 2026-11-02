import type { ReactNode } from "react";
import { RowActionsMenu } from "@/components/RowActionsMenu";

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * Page title row. Prefer one `primaryAction` plus `secondaryActions`, which
 * collapse into a "More actions" menu so the header never shows a wall of
 * buttons. `actions` stays for pages that have not moved over yet.
 */
export function PageHeader({
  title,
  description,
  actions,
  badge,
  primaryAction,
  secondaryActions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: PageHeaderAction[];
}) {
  const hasActionGroup = Boolean(primaryAction || secondaryActions?.length);

  return (
    <div className="page-header">
      <div className="page-header-text">
        <div className="page-header-title-row">
          <h1>{title}</h1>
          {badge}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {hasActionGroup ? (
        <div className="page-header-actions">
          {secondaryActions?.length ? (
            <RowActionsMenu triggerLabel="More actions">
              {secondaryActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={`btn btn-ghost${action.danger ? " menu-item-danger" : ""}`}
                  disabled={action.disabled}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </RowActionsMenu>
          ) : null}
          {primaryAction}
        </div>
      ) : (
        actions
      )}
    </div>
  );
}
