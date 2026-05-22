import type { VercelRequest, VercelResponse } from "@vercel/node";
import { compare as bcryptCompare } from "bcryptjs";
import {
  adminSupabase,
  buildCookieHeader,
  signToken,
} from "./_lib";

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS   = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    (req.socket?.remoteAddress) ??
    "unknown";

  // Rate limit: count failed attempts from this IP in the last window
  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { count, error: countError } = await adminSupabase
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("success", false)
    .gte("attempted_at", windowStart);

  if (countError) {
    return res.status(500).json({ error: "Service unavailable. Please try again." });
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    await adminSupabase
      .from("login_attempts")
      .insert({ ip_address: ip, success: false });
    return res.status(429).json({
      error: `Too many failed login attempts. Please wait ${RATE_LIMIT_WINDOW_MINUTES} minutes and try again.`,
    });
  }

  // Parse and validate body
  const body = req.body as { email?: string; password?: string };
  const email    = (body.email    ?? "").toLowerCase().trim();
  const password = body.password ?? "";

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  // Look up user by email
  const { data: users, error: dbError } = await adminSupabase
    .from("dashboard_users")
    .select("id, email, password_hash, display_name")
    .eq("email", email)
    .limit(1);

  if (dbError) {
    return res.status(500).json({ error: "Service unavailable. Please try again." });
  }

  const user = users?.[0] ?? null;

  // Always run bcrypt compare to prevent timing-based user-enumeration.
  // If user doesn't exist, compare against a dummy hash that will always fail.
  const hashToCompare =
    user?.password_hash ??
    "$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  const isValid = await bcryptCompare(password, hashToCompare);

  // Record the attempt regardless of outcome
  await adminSupabase
    .from("login_attempts")
    .insert({ ip_address: ip, success: isValid && user !== null });

  if (!user || !isValid) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Update last login timestamp (fire and forget — don't block the response)
  void adminSupabase
    .from("dashboard_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  const token = await signToken({
    sub:          user.id,
    email:        user.email,
    display_name: user.display_name,
  });

  res.setHeader("Set-Cookie", buildCookieHeader(token));
  return res.status(200).json({
    user: {
      id:           user.id,
      email:        user.email,
      display_name: user.display_name,
    },
  });
}
