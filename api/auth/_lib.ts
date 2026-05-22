import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";

const SUPABASE_URL       = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SESSION_SECRET_RAW = process.env.SESSION_SECRET ?? "";

export const COOKIE_NAME          = "sfn_session";
export const JWT_EXPIRY_SECONDS   = 7 * 24 * 60 * 60; // 7 days

export const adminSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(SESSION_SECRET_RAW);
}

export interface JwtPayload {
  sub:          string;
  email:        string;
  display_name: string;
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ email: payload.email, display_name: payload.display_name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${JWT_EXPIRY_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return {
      sub:          payload.sub as string,
      email:        payload["email"] as string,
      display_name: payload["display_name"] as string,
    };
  } catch {
    return null;
  }
}

export function buildCookieHeader(token: string): string {
  return [
    `${COOKIE_NAME}=${token}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${JWT_EXPIRY_SECONDS}`,
    "Path=/",
  ].join("; ");
}

export function buildClearCookieHeader(): string {
  return [
    `${COOKIE_NAME}=`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    "Max-Age=0",
    "Path=/",
  ].join("; ");
}

export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}
