// Dev test harness: starts the production server and the session-injecting
// proxy as child processes and restarts them if they exit.
//
// `next start` runs with NODE_ENV=production, where src/lib/auth.ts refuses the
// public dev fallback secret — so one random SESSION_SECRET is generated per run
// (unless one is already set) and shared by both children. Run `npm run build`
// first and run this from anywhere; the harness resolves the repo root itself.
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(join(root, ".next"))) {
  console.error("No production build found (.next) — run `npm run build` first.");
  process.exit(1);
}

// 24 random bytes → 48 hex chars, well above the 16-char minimum in auth.ts.
const sessionSecret = process.env.SESSION_SECRET?.trim() || randomBytes(24).toString("hex");

function keepAlive(name, cmd, args, env = {}) {
  const start = () => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "ignore",
      shell: true,
      detached: false,
      env: { ...process.env, SESSION_SECRET: sessionSecret, ...env },
    });
    console.log(`[${name}] pid ${child.pid}`);
    child.on("exit", (code) => {
      console.log(`[${name}] exited (${code}) — restarting in 1s`);
      setTimeout(start, 1000);
    });
  };
  start();
}

keepAlive("app", "npx", ["next", "start", "-p", "3111"]);
setTimeout(() => keepAlive("proxy", "node", [join(root, "scripts", "session-proxy.mjs")]), 4000);
