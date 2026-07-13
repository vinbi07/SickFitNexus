import { Modal } from "@/components/Modal";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="modal-message">{message}</p>
    </Modal>
  );
}
