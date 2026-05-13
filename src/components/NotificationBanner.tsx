export function NotificationBanner({
  tone,
  message,
  onClose,
}: {
  tone: "success" | "error";
  message: string;
  onClose?: () => void;
}) {
  return (
    <div className={`notice-banner notice-${tone}`}>
      <span>{message}</span>
      {onClose ? (
        <button className="btn btn-ghost btn-small" onClick={onClose}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
