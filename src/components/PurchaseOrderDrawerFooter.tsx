export function PurchaseOrderDrawerFooter({
  canEdit,
  editMode,
  saving,
  onCancel,
  onSave,
  onEnableEdit,
}: {
  canEdit: boolean;
  editMode: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onEnableEdit: () => void;
}) {
  if (!canEdit) {
    return (
      <div className="po-drawer-footer">
        <button className="btn btn-ghost" onClick={onCancel}>Close</button>
      </div>
    );
  }

  if (!editMode) {
    return (
      <div className="po-drawer-footer">
        <button className="btn btn-ghost" onClick={onCancel}>Close</button>
        <button className="btn btn-secondary" onClick={onEnableEdit}>Edit</button>
      </div>
    );
  }

  return (
    <div className="po-drawer-footer">
      <button className="btn btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>
      <button className="btn btn-primary" disabled={saving} onClick={onSave}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}
