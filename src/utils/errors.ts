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

export interface UiErrorLog {
  title: string;
  message: string;
  details: string[];
}

function uniqueDetails(parts: Array<string | null | undefined>) {
  return [...new Set(parts.filter((part): part is string => Boolean(part && part.trim())).map((part) => part.trim()))];
}

export function getUiErrorLog(error: unknown, fallbackTitle = "Something went wrong"): UiErrorLog {
  const rawMessage = getErrorMessage(error);

  if (error && typeof error === "object") {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      error_description?: unknown;
    };

    const code = typeof candidate.code === "string" ? candidate.code : null;
    const details = uniqueDetails([
      typeof candidate.details === "string" ? candidate.details : null,
      typeof candidate.hint === "string" ? candidate.hint : null,
      typeof candidate.error_description === "string" ? candidate.error_description : null,
      code ? `Error code: ${code}` : null,
    ]);

    if (code === "23505") {
      return {
        title: "This record already exists",
        message: "A unique field is duplicated. Check the PO number or any values that must be unique, then try again.",
        details: uniqueDetails([rawMessage, ...details]),
      };
    }

    if (code === "23503") {
      return {
        title: "A linked record is missing",
        message: "This purchase order references a related record that is no longer available. Re-select the vendor, product, or location and try again.",
        details: uniqueDetails([rawMessage, ...details]),
      };
    }

    if (code === "42501") {
      return {
        title: "Permission denied",
        message: "Your Supabase policy blocked this action. Check row-level security or API permissions for purchase orders and line items.",
        details: uniqueDetails([rawMessage, ...details]),
      };
    }

    return {
      title: fallbackTitle,
      message: rawMessage,
      details,
    };
  }

  return {
    title: fallbackTitle,
    message: rawMessage,
    details: [],
  };
}
