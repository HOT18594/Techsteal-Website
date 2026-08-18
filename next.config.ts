import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Add future Next.js options here as the site grows.
  // e.g. images: { remotePatterns: [...] } once you move the gallery
  // to self-hosted or external build screenshots.
};

export default nextConfig;
