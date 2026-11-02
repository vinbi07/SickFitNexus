import type { ReactNode } from "react";

/**
 * One region of a page: a single card with a title, an optional one-line
 * hint and an optional header action. Groups inside it are separated by
 * space, not by more boxes.
 */
export function Section({
  title,
  hint,
  action,
  children,
  className,
}: {
  title?: string;
  hint?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `nx-section ${className}` : "nx-section"}>
      {title || action ? (
        <header className="nx-section-header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {hint ? <p className="helper-text">{hint}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="nx-section-body">{children}</div>
    </section>
  );
}
