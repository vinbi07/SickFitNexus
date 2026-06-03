import { useRef, useState } from "react";
import { uploadManufacturerFile, type UploadFolder } from "@/services/storageService";
import { getErrorMessage } from "@/utils/errors";

type Props = {
  value: string | null | undefined;
  folder: UploadFolder;
  accept: string;
  label: string;
  onChange: (url: string) => void;
};

export function FileUploadCell({ value, folder, accept, label, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isImage = value && /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(value);

  async function handleFile(file: File) {
    try {
      setUploading(true);
      setErr(null);
      const url = await uploadManufacturerFile(file, folder);
      onChange(url);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div
      className="mfr-upload-cell"
      onClick={() => !uploading && inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      title={value ?? `Upload ${label}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={onInputChange}
      />

      {uploading ? (
        <span className="mfr-upload-spinner" title="Uploading…">⟳</span>
      ) : isImage ? (
        <img src={value!} className="mfr-upload-thumb" alt={label} />
      ) : value ? (
        <span className="mfr-upload-badge" title={value}>
          {value.split("/").pop()?.slice(0, 14) ?? "file"}
        </span>
      ) : (
        <span className="mfr-upload-placeholder">+ {label}</span>
      )}

      {err ? <span className="mfr-upload-err" title={err}>!</span> : null}
    </div>
  );
}
