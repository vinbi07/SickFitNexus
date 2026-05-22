#!/usr/bin/env node
/**
 * Seed the first dashboard admin user.
 *
 * Usage:
 *   npx tsx src/db/scripts/create-admin.ts --email you@example.com --password YourPassword123 --name "Your Name"
 *
 * Required environment variables (set in .env or shell):
 *   SUPABASE_URL              — your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (from Supabase → Settings → API)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { hash as bcryptHash } from "bcryptjs";
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
const name     = getArg("name", false) || email.split("@")[0];

if (password.length < 12) {
  console.error("❌  Password must be at least 12 characters.");
  process.exit(1);
}

const SUPABASE_URL     = process.env.SUPABASE_URL     ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌  Missing environment variables.\n" +
    "    Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file or shell.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`⏳  Hashing password for ${email} (bcrypt cost=12)…`);
  const password_hash = await bcryptHash(password, 12);

  const { data, error } = await supabase
    .from("dashboard_users")
    .insert({ email, password_hash, display_name: name })
    .select("id, email, display_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      console.error(`❌  A user with email "${email}" already exists.`);
    } else {
      console.error("❌  Failed to create user:", error.message);
    }
    process.exit(1);
  }

  console.log("✅  Admin user created:");
  console.log(`    ID:    ${data.id}`);
  console.log(`    Email: ${data.email}`);
  console.log(`    Name:  ${data.display_name}`);
}

void main();
