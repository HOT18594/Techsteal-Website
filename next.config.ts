import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-rendered (not static export) so the API routes under src/app/api
  // and the database-backed content actually run. Deploys to Vercel / `next start`.
  images: { unoptimized: true },
  // Add future Next.js options here as the site grows.
  // e.g. images: { remotePatterns: [...] } once you move the gallery
  // to self-hosted or external build screenshots.
};

export default nextConfig;
