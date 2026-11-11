import type { PropsWithChildren, ReactNode } from "react";

export function Modal({
  title,
  actions,
  children,
  onClose,
  className,
}: PropsWithChildren<{
  title: string;
  /** Extra class on the shell, e.g. to make it wider. */
  className?: string;
  actions?: ReactNode;
  onClose: () => void;
}>) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={className ? `modal-shell ${className}` : "modal-shell"} onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h3>{title}</h3>
          <div className="btn-row">
            {actions}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
