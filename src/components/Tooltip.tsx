import { useId, useState, type ReactNode } from "react";

export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="tooltip-wrap"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? tooltipId : undefined}>{children}</span>
      {visible ? (
        <span role="tooltip" id={tooltipId} className={`tooltip-bubble tooltip-${side}`}>
          {content}
        </span>
      ) : null}
    </span>
  );
}

export function InfoTooltip({ content }: { content: ReactNode }) {
  return (
    <Tooltip content={content}>
      <button type="button" className="tooltip-trigger" aria-label="More information">
        i
      </button>
    </Tooltip>
  );
}
