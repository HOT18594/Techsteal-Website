import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Server-rendered (not static export) so the API routes under src/app/api
  // and the database-backed content actually run. Deploys to Vercel / `next start`.
  images: { unoptimized: true },
  // Don't advertise the framework in response headers (fingerprinting).
  poweredByHeader: false,
  // Security headers. The site carries a 7-day session cookie and admin
  // actions (role changes, member removal, server start/stop), so framing
  // the site from a third party must be impossible (clickjacking).
  // Font Awesome and the Minecraft fonts are self-hosted, so CSP locks down
  // scripts, styles, fonts, and connections to same-origin (plus https: images
  // for Discord PFPs, Minotar heads, and Supabase Storage).
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // A 7-day session cookie must never travel over a downgraded or
          // stripped connection — force HTTPS for two years (preload).
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
