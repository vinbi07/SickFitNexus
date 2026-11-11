import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

/** Same check the dashboard runs on load: the localStorage session token, verified by admin_check_session. */
async function hasValidSession(req: VercelRequest): Promise<boolean> {
  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("admin_check_session", { p_token: token });
  if (error) return false;
  return Boolean((data as { user?: unknown } | null)?.user);
}

// Vercel caps request bodies at ~4.5 MB; base64 adds ~33%, so PDFs up to ~3.3 MB fit.
const MAX_BASE64_LENGTH = 4_400_000;

// Structured outputs cap union-typed fields at 16, so text fields are plain strings ("" when not
// printed) and normalizeEmptyStrings turns "" back into null before the client sees it.
const nullableString = { type: "string" } as const;
const nullableNumber = { type: ["number", "null"] } as const;

const addressSchema = {
  type: "object",
  additionalProperties: false,
  required: ["company", "street", "city", "state", "zip"],
  properties: {
    company: nullableString,
    street: nullableString,
    city: nullableString,
    state: nullableString,
    zip: nullableString,
  },
} as const;

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["purchase_orders"],
  properties: {
    purchase_orders: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "po_number", "order_date", "start_ship_date", "ship_complete_date", "buyer_name",
          "payment_terms_raw", "currency", "bill_to", "ship_to", "additional_ship_to",
          "lines", "total_cost", "total_retail",
        ],
        properties: {
          po_number: { type: "string" },
          order_date: nullableString,
          start_ship_date: nullableString,
          ship_complete_date: nullableString,
          buyer_name: nullableString,
          payment_terms_raw: nullableString,
          currency: nullableString,
          bill_to: addressSchema,
          ship_to: {
            ...addressSchema,
            required: [...addressSchema.required, "store_code"],
            properties: { ...addressSchema.properties, store_code: nullableString },
          },
          additional_ship_to: nullableString,
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "line_number", "retailer_item_number", "vendor_style", "description",
                "upc", "quantity", "unit", "unit_cost", "unit_retail",
              ],
              properties: {
                line_number: nullableString,
                retailer_item_number: nullableString,
                vendor_style: nullableString,
                description: nullableString,
                upc: nullableString,
                quantity: { type: "number" },
                unit: nullableString,
                unit_cost: { type: "number" },
                unit_retail: nullableNumber,
              },
            },
          },
          total_cost: nullableNumber,
          total_retail: nullableNumber,
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You are reading purchase orders that retailers sent to SickFit, a sock brand (the vendor).

Extract every PURCHASE ORDER in the attached PDF. A file can hold several POs, and can also contain other pages such as invoices, packing slips or cover sheets; skip those pages entirely. Pages may be rotated.

For each PO:
- po_number: the retailer's PO number exactly as printed.
- Dates as YYYY-MM-DD. order_date is the order/PO date; start_ship_date and ship_complete_date are the ship window.
- buyer_name: the buyer. payment_terms_raw: the pay term text as printed (e.g. "NT30 Net due in 30 days").
- bill_to: who pays (the retailer's billing entity and address).
- ship_to: where the goods go. Put the store or DC number (e.g. "9801") in store_code and the store name (e.g. "PARADIES SLC") in company. additional_ship_to is any extra ship-to code such as "W033 (9801)".
- lines: one entry per line item. retailer_item_number is the retailer's own item number column; vendor_style is the vendor style / SKU column; upc is digits only. quantity is the order quantity, unit_cost the per-unit gross cost, unit_retail the per-unit retail price.
- total_cost and total_retail: the PO's printed totals.

Copy values exactly as printed, including typos (for example a style printed "CRW-PO1-..." stays that way). Do not correct, merge or infer products; matching happens later. Use an empty string for text that is not on the page, and null for missing numbers.`;

function normalizeEmptyStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeEmptyStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeEmptyStrings(entry)]));
  }
  return typeof value === "string" && !value.trim() ? null : value;
}

const MODEL = process.env.PO_IMPORT_MODEL || "claude-opus-5-5";

export class ExtractionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Reads every purchase order in the PDF. Throws ExtractionError with a user-facing message. */
export async function extractPurchaseOrders(pdfBase64: string, client = new Anthropic()) {
  // Streamed because a large max_tokens needs it; we only use the final message.
  const response = await client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: extractionSchema },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: INSTRUCTIONS },
        ],
      },
    ],
  }).finalMessage();

  if (response.stop_reason === "refusal") {
    throw new ExtractionError("The PDF could not be read. Try re-exporting it and uploading again.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractionError("This PDF has too many purchase orders to read at once. Split it into smaller files.", 422);
  }

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return {
    result: normalizeEmptyStrings(JSON.parse(text)) as { purchase_orders: unknown[] },
    usage: response.usage,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!(await hasValidSession(req))) {
    return res.status(401).json({ error: "Sign in to import purchase orders." });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "PO import is not configured: ANTHROPIC_API_KEY is missing." });
  }

  const body = (req.body ?? {}) as { pdfBase64?: string };
  const pdfBase64 = String(body.pdfBase64 ?? "").replace(/^data:application\/pdf;base64,/, "").replace(/\s/g, "");
  if (!pdfBase64) {
    return res.status(400).json({ error: "Attach a PDF to import." });
  }
  if (pdfBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ error: "This PDF is too large to import (limit about 3 MB). Split it and try again." });
  }

  try {
    const { result } = await extractPurchaseOrders(pdfBase64);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ExtractionError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Too many imports right now. Wait a minute and try again." });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return res.status(400).json({ error: "The PDF was rejected. Make sure it is a valid, unencrypted PDF." });
    }
    if (error instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `PDF reading service error (${error.status ?? "unknown"}). Try again.` });
    }
    if (error instanceof SyntaxError) {
      return res.status(502).json({ error: "The PDF reader returned an unreadable result. Try again." });
    }
    return res.status(500).json({ error: "Unexpected error while reading the PDF." });
  }
}
