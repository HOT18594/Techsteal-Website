// Local test proxy: forwards to the app and injects a signed session cookie
// so browser tests can exercise signed-in UI without Discord OAuth.
// Test account (per Ethan): hot77_18594 — NOT glsl2.
import http from "node:http";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode("test-secret-0123456789abcdef");
const token = await new SignJWT({
  user: { id: "discord:705576212864696400", username: "hot77_18594", role: "admin", permissions: [] },
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("2h")
  .sign(SECRET);

const proxy = http.createServer(async (req, res) => {
  try {
    const headers = { ...req.headers, cookie: `techsteal_session=${token}` };
    const upstream = await fetch(`http://localhost:3111${req.url}`, {
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
proxy.listen(3113, () => console.log("session proxy on 3113"));
