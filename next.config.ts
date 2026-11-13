import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-rendered (not static export) so the API routes under src/app/api
  // and the database-backed content actually run. Deploys to Vercel / `next start`.
  // `qualities` allow-lists the non-default quality the hero image requests
  // (required config from Next.js 16).
  images: { unoptimized: true, qualities: [85] },
  // Don't advertise the framework in response headers (fingerprinting).
  poweredByHeader: false,
  // Security headers. The site carries a 7-day session cookie and admin
  // actions (role changes, member removal, server start/stop), so framing
  // the site from a third party must be impossible (clickjacking).
  // No CSP yet: Font Awesome loads from cdnjs — add one that allows it
  // before locking down connect/script sources.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
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
  // Add future Next.js options here as the site grows.
  // e.g. images: { remotePatterns: [...] } once you move the gallery
  // to self-hosted or external build screenshots.
};

export default nextConfig;
