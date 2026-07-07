export function CopyShareLinkButton({
  url,
  disabled,
  title,
  onCopied,
}: {
  url: string;
  disabled?: boolean;
  title?: string;
  onCopied: () => void;
}) {
  return (
    <button
      className="btn btn-ghost btn-small"
      disabled={disabled}
      title={title}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        onCopied();
      }}
    >
      Copy Share Link
    </button>
  );
}
