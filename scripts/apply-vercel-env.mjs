#!/usr/bin/env node
/**
 * Push env vars to the Vercel project (encrypted, production+preview+dev).
 *
 * Source of truth: the `.env.vercel` file at the repo root. Only the keys
 * listed there are pushed — NOT `.env.local`, so dev-only values
 * (e.g. the localhost NEXT_PUBLIC_SITE_URL, or the dev SESSION_SECRET
 * fallback) can never overwrite the real production ones.
 *
 * This script fails fast (exit 1) when `.env.vercel` is missing or when no
 * non-empty key was pushed: a deploy that silently keeps stale env vars is
 * worse than a failed deploy.
 *
 * Team-owned projects need the team scope on the REST call. The local
 * `.vercel/project.json` link stores it as `orgId`, which is sent here as the
 * `teamId` query parameter.
 *
 * Secrets never live in this script: the token comes from the VERCEL_TOKEN
 * env var or the `.vercel-token` file.
 *
 * Usage:
 *   node scripts/apply-vercel-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = ".env.vercel";

function loadEnv(file) {
  const path = join(root, file);
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const envPath = join(root, ENV_FILE);
if (!existsSync(envPath)) {
  console.error(`✗ ${ENV_FILE} not found at ${envPath}`);
  console.error("  Create it with the production keys to push (see the header of this script).");
  console.error("  Refusing to continue so a deploy cannot silently use stale env vars.");
  process.exit(1);
}

const merged = loadEnv(ENV_FILE); // explicit list — see header comment
const entries = Object.entries(merged).filter(([, value]) => value !== "");
if (entries.length === 0) {
  console.error(`✗ ${ENV_FILE} contains no non-empty keys — nothing to push.`);
  console.error("  Refusing to continue so a deploy cannot silently use stale env vars.");
  process.exit(1);
}

const token = process.env.VERCEL_TOKEN?.trim() ||
  (existsSync(join(root, ".vercel-token")) ? readFileSync(join(root, ".vercel-token"), "utf8").trim() : "");

if (!token) { console.error("✗ No token: set VERCEL_TOKEN or create .vercel-token"); process.exit(1); }

const projectPath = join(root, ".vercel", "project.json");
if (!existsSync(projectPath)) {
  console.error("✗ .vercel/project.json not found — link the project with `npx vercel link` first.");
  process.exit(1);
}
const project = JSON.parse(readFileSync(projectPath, "utf8"));
const projectId = project.projectId;
const teamId = typeof project.orgId === "string" ? project.orgId.trim() : "";

if (!projectId) { console.error("✗ No projectId in .vercel/project.json"); process.exit(1); }

const envUrl = new URL(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env`);
envUrl.searchParams.set("upsert", "true");
if (teamId) envUrl.searchParams.set("teamId", teamId);

console.log(
  `Pushing ${entries.length} env var(s) to project ${projectId}` +
    (teamId ? ` (team ${teamId})…` : " (no team scope — project is not team-owned)…")
);

let ok = true;
let pushed = 0;
for (const [key, value] of entries) {
  const res = await fetch(envUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: ["production", "preview", "development"],
    }),
  });
  if (res.ok) {
    pushed += 1;
    console.log(`✓ ${key}`);
  } else {
    ok = false;
    console.error(`✗ ${key} — ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

console.log(`${pushed}/${entries.length} key(s) pushed.`);
process.exit(ok ? 0 : 1);
