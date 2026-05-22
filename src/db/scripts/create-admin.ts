#!/usr/bin/env node
/**
 * Seed the first dashboard admin user.
 * Password is hashed server-side in PostgreSQL via pgcrypto (bcrypt).
 *
 * Usage:
 *   npx tsx src/db/scripts/create-admin.ts --email you@example.com --password YourPassword123 --name "Your Name"
 *
 * Required environment variables (set in .env or shell):
 *   VITE_SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (from Supabase → Settings → API)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env from project root (tsx doesn't auto-load it)
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const args = process.argv.slice(2);

function getArg(name: string, required = true): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || !args[idx + 1]) {
    if (required) {
      console.error(`❌  Missing required argument: --${name}`);
      process.exit(1);
    }
    return "";
  }
  return args[idx + 1];
}

const email    = getArg("email").toLowerCase().trim();
const password = getArg("password");
const name     = getArg("name", false);

if (password.length < 12) {
  console.error("❌  Password must be at least 12 characters.");
  process.exit(1);
}

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing environment variables.\n" +
    "    Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`⏳  Creating admin user: ${email}`);

  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email:        email,
    p_password:     password,
    p_display_name: name,
  });

  if (error) {
    console.error("❌  Failed:", error.message);
    process.exit(1);
  }

  const result = data as { id?: string; email?: string; display_name?: string; error?: string } | null;

  if (result?.error) {
    console.error("❌  Failed:", result.error);
    process.exit(1);
  }

  console.log("✅  Admin user created:");
  console.log(`    ID:    ${result?.id}`);
  console.log(`    Email: ${result?.email}`);
  console.log(`    Name:  ${result?.display_name}`);
}

void main();
