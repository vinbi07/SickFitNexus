export function ExportPdfButton({
  disabled,
  title,
  onClick,
}: {
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button className="btn btn-ghost btn-small" disabled={disabled} title={title} onClick={onClick}>
      Export PDF
    </button>
  );
}
