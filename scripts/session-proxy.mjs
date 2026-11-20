// Local test proxy: forwards to the app and injects a signed session cookie so
// browser tests can exercise signed-in UI without Discord OAuth.
//
// This is a local dev tool. It binds to 127.0.0.1 by default; override
// PROXY_HOST only if you deliberately want to expose it to your LAN (don't)
// and it forwards to the app on 127.0.0.1:3111 (override with PROXY_UPSTREAM).
//
// Secret: read from SESSION_SECRET, which must match the app under test. When
// the proxy runs on its own against `npm run dev`, that falls back to the same
// fixed dev secret src/lib/auth.ts uses locally. Production-mode servers
// (`next start`) additionally require a real SESSION_SECRET — the harness in
// scripts/dev-harness.mjs generates one per run and passes it to both children.
//
// Identity: a throwaway, clearly fake admin by default. Set
// SESSION_TEST_USER_ID / SESSION_TEST_USERNAME to target a specific account —
// never hardcode a real Discord id or secret in this file.
import http from "node:http";
import { SignJWT } from "jose";

const DEV_SECRET = "dev-session-secret-change-me"; // matches src/lib/auth.ts dev fallback
const SECRET = process.env.SESSION_SECRET?.trim() || DEV_SECRET;

const TEST_USER = {
  id: process.env.SESSION_TEST_USER_ID?.trim() || "discord:000000000000000000",
  username: process.env.SESSION_TEST_USERNAME?.trim() || "test-admin",
  role: "admin",
  permissions: [],
};

const HOST = process.env.PROXY_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.PROXY_PORT) || 3113;
const UPSTREAM = process.env.PROXY_UPSTREAM?.trim() || "http://127.0.0.1:3111";

const token = await new SignJWT({ user: TEST_USER })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(new TextEncoder().encode(SECRET));

const proxy = http.createServer(async (req, res) => {
  try {
    const headers = { ...req.headers, cookie: `techsteal_session=${token}` };
    const upstream = await fetch(`${UPSTREAM}${req.url}`, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: "half",
      redirect: "manual",
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const outHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!["set-cookie", "content-encoding", "transfer-encoding", "content-length"].includes(k)) outHeaders[k] = v;
    });
    outHeaders["content-length"] = String(buf.length);
    res.writeHead(upstream.status, outHeaders);
    res.end(buf);
  } catch {
    // One failed upstream request must not kill the proxy process.
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("upstream unavailable");
  }
});

proxy.listen(PORT, HOST, () =>
  console.log(
    `session proxy on http://${HOST}:${PORT} → ${UPSTREAM} as ${TEST_USER.username} (${TEST_USER.id})`
  )
);
