import type { UiErrorLog } from "@/utils/errors";

export function InlineErrorLog({ error }: { error: UiErrorLog }) {
  return (
    <div className="form-error field-wide">
      <strong>{error.title}</strong>
      <p className="error-copy">{error.message}</p>
      {error.details.length ? (
        <details className="error-details">
          <summary>Show technical details</summary>
          <ul className="error-detail-list">
            {error.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
