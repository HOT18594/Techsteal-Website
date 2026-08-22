// Dev test harness: starts the production server and the session-injecting
// proxy as child processes and restarts them if they exit.
import { spawn } from "node:child_process";

function keepAlive(name, cmd, args, env = {}) {
  const start = () => {
    const child = spawn(cmd, args, {
      stdio: "ignore",
      shell: true,
      detached: false,
      env: { ...process.env, ...env },
    });
    console.log(`[${name}] pid ${child.pid}`);
    child.on("exit", (code) => {
      console.log(`[${name}] exited (${code}) — restarting in 1s`);
      setTimeout(start, 1000);
    });
  };
  start();
}

keepAlive("app", "npx", ["next", "start", "-p", "3111"], {
  SESSION_SECRET: "test-secret-0123456789abcdef",
});
setTimeout(() => keepAlive("proxy", "node", ["scripts/session-proxy.mjs"]), 4000);
