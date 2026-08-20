#!/usr/bin/env node
/**
 * Push local env vars to the Vercel project (encrypted, production+preview+dev).
 *
 * It never embeds secrets: the token comes from the VERCEL_TOKEN env var or
 * the `.vercel-token` file, and the variables come from `.env.local` plus
 * `.env.vercel` (the latter wins on conflicts and can add keys that don't
 * belong in the local dev file).
 *
 * Usage:
 *   node scripts/apply-vercel-env.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const token = process.env.VERCEL_TOKEN?.trim() ||
  (existsSync(join(root, ".vercel-token")) ? readFileSync(join(root, ".vercel-token"), "utf8").trim() : "");

const project = JSON.parse(readFileSync(join(root, ".vercel", "project.json"), "utf8"));
const projectId = project.projectId;

const merged = { ...loadEnv(".env.local"), ...loadEnv(".env.vercel") };

if (!token) { console.error("✗ No token: set VERCEL_TOKEN or create .vercel-token"); process.exit(1); }
if (!projectId) { console.error("✗ No projectId in .vercel/project.json"); process.exit(1); }

let ok = true;
for (const [key, value] of Object.entries(merged)) {
  if (!value) continue; // skip empty placeholders
  const res = await fetch(
    `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
    {
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
    }
  );
  if (res.ok) {
    console.log(`✓ ${key}`);
  } else {
    ok = false;
    console.error(`✗ ${key} — ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
process.exit(ok ? 0 : 1);