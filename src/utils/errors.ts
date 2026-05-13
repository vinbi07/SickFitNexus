export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown };
    const parts = [
      typeof candidate.message === "string" ? candidate.message : null,
      typeof candidate.error_description === "string" ? candidate.error_description : null,
      typeof candidate.details === "string" ? candidate.details : null,
      typeof candidate.hint === "string" ? candidate.hint : null,
    ].filter(Boolean);

    if (parts.length) {
      return parts.join(" ");
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unknown error";
}
