import { useRef } from "react";

export function UploadZone({
  onFileSelected,
}: {
  onFileSelected: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      className="upload-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files.item(0);
        if (file) onFileSelected(file);
      }}
    >
      <h3>Drag and drop a PO CSV file</h3>
      <p className="muted">Import vendor exports, preview headers, map columns, and normalize into Supabase.</p>
      <div className="btn-row" style={{ justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
          Select CSV
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.item(0);
          if (file) onFileSelected(file);
        }}
      />
    </div>
  );
}
