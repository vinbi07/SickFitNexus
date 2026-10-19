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

const nullableString = { type: ["string", "null"] } as const;
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

Copy values exactly as printed, including typos (for example a style printed "CRW-PO1-..." stays that way). Do not correct, merge or infer products; matching happens later. Use null for anything not on the page.`;

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

  const client = new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
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
    });

    if (response.stop_reason === "refusal") {
      return res.status(422).json({ error: "The PDF could not be read. Try re-exporting it and uploading again." });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(422).json({ error: "This PDF has too many purchase orders to read at once. Split it into smaller files." });
    }

    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
    const parsed = JSON.parse(text) as { purchase_orders: unknown[] };
    return res.status(200).json(parsed);
  } catch (error) {
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
