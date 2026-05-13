import type { PropsWithChildren, ReactNode } from "react";

export function Modal({
  title,
  actions,
  children,
  onClose,
}: PropsWithChildren<{
  title: string;
  actions?: ReactNode;
  onClose: () => void;
}>) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h3>{title}</h3>
          <div className="btn-row">
            {actions}
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
